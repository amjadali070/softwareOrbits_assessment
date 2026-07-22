# Real-Time Cinema Seat Reservation System

A full-stack engineering assessment: a real-time seat reservation system for a single 50-seat
cinema showing. Multiple users — and third-party booking partners — can attempt to reserve
overlapping seats at the same time. The system guarantees a seat is **never double-booked**,
even under heavy concurrent load and even when the backend runs as multiple horizontally-scaled
instances behind a load balancer.

Correctness and concurrency handling are the focus of this project — not UI polish.

---

## Project Status

This repo is being built in phases. Current state:

- [x] **Phase 0 — Scaffolding**: monorepo layout, backend (Express + TypeScript) and frontend
      (Next.js + TypeScript) both boot successfully, linting/formatting configured.
- [x] **Phase 1 — Database & Models**: `Seat` and `Reservation` Mongoose schemas, a seed script
      that populates 50 seats (rows A–E × 10), and a verified replica-set transaction (raced two
      separate Node processes for the same seat — exactly one committed, the other failed clean).
- [x] **Phase 2 — Booking Service**: `reserveSeats()` in `services/reservation.service.ts` — the
      single function every reservation path calls. Per-seat conditional updates run inside a
      MongoDB transaction for all-or-nothing multi-seat booking; unknown seat IDs, availability
      conflicts, and bad input each return a distinct typed result. Covered by a Vitest suite
      including a 20-concurrent-request race against 3 seats (`npm test` in `backend/`).
- [x] **Phase 3 — Backend REST APIs**: `GET /api/seats`, `GET /api/seats/availability`,
      `POST /api/reservations` (frontend), and `POST /api/partner/v1/reservations` (partner, API
      key required) all live. Both reservation routes are wired to the exact same handler
      function — see [API Reference](#api-reference). Zod-validated input, centralized JSON error
      shape, and a live 10-concurrent-request test spanning both routes against one seat produced
      exactly one `201` and nine `409`s.
- [x] **Phase 4 — Real-Time Layer**: Socket.IO attached to the HTTP server, `@socket.io/redis-adapter`
      for cross-instance fan-out, `seats:snapshot` on connect and `seats:updated` after every
      commit. Verified with two backend instances on different ports sharing one Mongo + one
      Redis: a reservation made via instance A's HTTP API was received by a socket client
      connected only to instance B, with no direct link between the two processes.
- [ ] **Phase 5** — Frontend seat map UI
- [ ] **Phase 6** — High-concurrency simulation (100 concurrent users)
- [ ] **Phase 7** — Automated tests
- [ ] **Phase 8+** — Bonus items (reservation expiration, Docker, cancellation, etc.)

This section will be kept up to date as phases land, and the sections below (setup, scripts,
architecture) reflect the current implementation, not the finished aspiration.

---

## Tech Stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Language  | TypeScript (strict mode) end-to-end                          |
| Frontend  | Next.js (App Router) + React                                 |
| Backend   | Express.js                                                   |
| Database  | MongoDB + Mongoose (replica set — required for transactions) |
| Real-time | Socket.IO + `@socket.io/redis-adapter` + Redis               |
| Testing   | Vitest + Supertest                                           |
| Tooling   | ESLint (flat config) + Prettier (shared root config)         |

---

## Repository Structure

```
.
├── backend/                Express + TypeScript API
│   ├── src/
│   │   ├── app.ts          Express app factory
│   │   ├── server.ts       HTTP server entrypoint
│   │   ├── config/         env loading, db/redis connections
│   │   ├── models/         Mongoose schemas (Seat, Reservation)
│   │   ├── services/       reservation.service.ts — shared booking logic
│   │   ├── routes/         frontend + partner route handlers
│   │   ├── middleware/      error handling, partner API-key auth
│   │   ├── realtime/       Socket.IO + Redis adapter setup
│   │   └── simulation/     concurrency load-test script
│   └── .env.example
├── frontend/                Next.js + TypeScript UI
│   ├── src/
│   │   ├── app/            App Router pages
│   │   ├── components/     SeatGrid, ReservationPanel, etc.
│   │   └── lib/            API client, socket client
│   └── .env.example
├── .prettierrc.json         Shared formatting config (both apps inherit it)
└── README.md
```

`backend/` and `frontend/` are independent npm projects (no workspaces) — each has its own
`package.json`, dependencies, and scripts.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- MongoDB, running as a **replica set** (see note below)
- Redis (e.g. `docker run -d -p 6379:6379 redis:7` or a local install) — required for the
  Socket.IO adapter, even with a single backend instance

### MongoDB replica set (required now)

Multi-seat reservations use MongoDB transactions, which only work against a replica set — even a
single-node one. Pick one option:

**Local `mongod`:**

```bash
mkdir -p ~/mongo-data
mongod --replSet rs0 --dbpath ~/mongo-data --port 27017 --fork --logpath ~/mongo-data/mongod.log
mongosh --eval "rs.initiate()"   # one-time, only needed the first time
```

**Docker:**

```bash
docker run -d --name cinema-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec cinema-mongo mongosh --eval "rs.initiate()"
```

Either way, `backend/.env`'s default `MONGO_URI` (`mongodb://127.0.0.1:27017/cinema?replicaSet=rs0`)
will work unchanged.

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run seed        # populates 50 seats (rows A–E x 10), safe to re-run (idempotent reset)
npm run dev          # http://localhost:4000
```

Verify it's up: `curl http://localhost:4000/health` → `{"status":"ok"}`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev        # http://localhost:3000
```

---

## Environment Variables

**`backend/.env`**

| Variable          | Purpose                                               | Default (example)                                 |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `PORT`            | HTTP port for the Express server                      | `4000`                                            |
| `MONGO_URI`       | MongoDB connection string (replica set)               | `mongodb://127.0.0.1:27017/cinema?replicaSet=rs0` |
| `REDIS_URL`       | Redis connection string (Socket.IO adapter + pub/sub) | `redis://127.0.0.1:6379`                          |
| `PARTNER_API_KEY` | Shared secret third-party callers must send           | `partner-secret-key`                              |
| `CORS_ORIGIN`     | Allowed origin for the frontend                       | `http://localhost:3000`                           |

**`frontend/.env`**

| Variable                 | Purpose                           |
| ------------------------ | --------------------------------- |
| `NEXT_PUBLIC_API_URL`    | Base URL of the backend REST API  |
| `NEXT_PUBLIC_SOCKET_URL` | Base URL for the Socket.IO client |

---

## Available Scripts

**Backend** (`cd backend`)

| Command          | Description                                     |
| ---------------- | ----------------------------------------------- |
| `npm run dev`    | Start the API with hot-reload (`ts-node-dev`)   |
| `npm run build`  | Type-check and compile to `dist/`               |
| `npm start`      | Run the compiled build (`dist/server.js`)       |
| `npm run lint`   | ESLint over `src/`                              |
| `npm run format` | Format `src/` with Prettier                     |
| `npm test`       | Run the Vitest suite                            |
| `npm run seed`   | Wipe and re-seed the DB with 50 available seats |

**Frontend** (`cd frontend`)

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `npm run dev`    | Start Next.js dev server (Turbopack) |
| `npm run build`  | Production build                     |
| `npm start`      | Serve the production build           |
| `npm run lint`   | ESLint                               |
| `npm run format` | Format `src/` with Prettier          |

---

## API Reference

All responses are JSON. Errors always have the shape
`{ "error": { "code": string, "message": string, ...extra } }`.

### `GET /api/seats`

Returns every seat. `200`:

```json
{ "seats": [{ "id": "A1", "row": "A", "number": 1, "status": "available" }, ...] }
```

### `GET /api/seats/availability`

Same shape as above, filtered to `status: "available"` only.

### `POST /api/reservations` (frontend path)

Body: `{ "userId": string, "seatIds": string[] }`

| Outcome                         | Status | Body                                                                                    |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Booked                          | `201`  | `{ "reservation": { reservationId, userId, seats, source, status, createdAt } }`        |
| One or more seats already taken | `409`  | `{ "error": { "code": "SEATS_UNAVAILABLE", "message", "conflictingSeats": string[] } }` |
| Unknown seat id(s)              | `400`  | `{ "error": { "code": "INVALID_SEATS", "message", "invalidSeatIds": string[] } }`       |
| Malformed body (empty/missing)  | `400`  | `{ "error": { "code": "INVALID_INPUT", "message", "details" } }`                        |

A conflict never partially books — if any requested seat is unavailable, none of the seats in that
request are reserved (see [Concurrency strategy](#concurrency-strategy)).

### `POST /api/partner/v1/reservations` (third-party path)

Identical contract and status codes to the route above, plus a required header:

```
x-api-key: <PARTNER_API_KEY>
```

Missing or wrong key → `401` `{ "error": { "code": "UNAUTHORIZED", "message" } }`. Otherwise this
route calls the exact same booking function as the frontend route — see
[Shared booking logic](#shared-booking-logic-frontend--third-party-parity).

### `GET /health`

Liveness check, `200` `{ "status": "ok" }` — not part of the seat/reservation API surface.

### Real-time events (Socket.IO)

Connect a Socket.IO client to the backend's base URL (no separate path/namespace).

| Event            | Direction       | Payload                       | When                                                                                                                                                |
| ---------------- | --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seats:snapshot` | server → client | `{ seats: SeatDTO[] }`        | Once, right after a client connects — full current seat state so a freshly opened tab doesn't have to wait for the next reservation.                |
| `seats:updated`  | server → client | `{ seats: { id, status }[] }` | After every successful reservation, on **every** connected client, regardless of which backend instance served the request or which client made it. |

There is no client → server event in this system — sockets are read-only status feeds; all writes
go through the REST endpoints above.

---

## Architecture & Design Decisions

### Data model (MongoDB)

- **Seat** — one document per seat: `_id` (e.g. `A1`), `row`, `number`, `status`
  (`available` | `reserved`), `version` (optimistic-concurrency guard), `reservationId`.
- **Reservation** — one document per booking: `reservationId` (public UUID), `userId`,
  `seats[]`, `source` (`frontend` | `partner`), `status`, `createdAt`.

### Concurrency strategy

A seat can only move from `available` → `reserved` via a single **atomic conditional update**:

```ts
Seat.findOneAndUpdate(
  { _id: seatId, status: 'available' },
  { $set: { status: 'reserved', reservationId }, $inc: { version: 1 } },
  { returnDocument: 'after', session },
);
```

If two requests race for the same seat, only one `findOneAndUpdate` matches `status: 'available'`;
the loser gets `null` back and fails cleanly — no double-booking is possible, by construction of
MongoDB's single-document atomicity.

For a **multi-seat** reservation, all seats must succeed or none should be booked. This is done by
running the same conditional update for every requested seat **inside a MongoDB transaction**
(which requires a replica set): if any seat in the group is already taken, the whole transaction
aborts and nothing commits. Unknown seat IDs are rejected the same way (checked against the seat
collection before any update is attempted) and reported as a distinct error from "seat already
taken," so callers can tell a bad request apart from a real conflict.

This is verified directly, not just asserted: `backend/src/services/reservation.service.test.ts`
fires 20 concurrent `reserveSeats()` calls racing the same 3 seats and asserts exactly one winner
per seat, no seat left in an inconsistent state, and no reservation record referencing an
already-claimed seat.

### Shared booking logic (frontend + third-party parity)

Both the frontend-facing route and the third-party partner route call **one function**:

```ts
reserveSeats(userId: string, seatIds: string[], source: 'frontend' | 'partner'): Promise<ReservationResult>
```

This function is the single source of truth for booking rules and lives in
`backend/src/services/reservation.service.ts`. Rather than relying on two separately-written
controllers happening to look similar, `backend/src/routes/reservationHandler.ts` exports
**one** `createReservationHandler(source)` factory that both routes mount:

```ts
// reservations.routes.ts (frontend)
router.post('/', validateBody(reserveSeatsRequestSchema), createReservationHandler('frontend'));

// partner.routes.ts (third-party)
router.post(
  '/v1/reservations',
  partnerAuth,
  validateBody(reserveSeatsRequestSchema),
  createReservationHandler('partner'),
);
```

The only differences between the two routes are the URL, the partner-only API-key middleware, and
the `source` tag passed through to `reserveSeats`. There is no second implementation of booking
rules to drift out of sync — this is what guarantees a partner request and a frontend request
racing for the same seat are resolved by the exact same code path and the exact same
database-level guarantee. Verified live: 10 concurrent requests (5 via each route) targeting one
seat produced exactly one `201` and nine `409`s, and a direct partner-vs-frontend conflict test
(reserve via frontend, then try the same seat via partner) correctly returned `409`.

### Correctness across multiple backend instances

Correctness does **not** rely on anything in-process — no in-memory locks, no mutex, no
single-instance queue. It comes entirely from MongoDB's atomic operations and transaction
guarantees at the database layer, which every backend instance shares. Two Node processes on two
different machines calling the same `findOneAndUpdate` / transaction against the same MongoDB
deployment are safe by construction: MongoDB itself serializes the conflicting writes. Horizontal
scaling of the API layer is safe precisely because none of the correctness logic lives in that
layer.

### Real-time updates across instances

Each backend instance runs its own Socket.IO server (`realtime/socket.ts`, attached to the same
HTTP server as Express), but all instances share Redis pub/sub channels via
`@socket.io/redis-adapter`. The booking service never talks to Socket.IO directly — after a
successful commit it calls `seatEvents.emitSeatsUpdated(...)` on a plain Node `EventEmitter`
(`realtime/events.ts`), and the socket layer is just one subscriber to that emitter. That instance
then calls `io.emit('seats:updated', payload)`; the redis-adapter fans it out through Redis to
every other instance's connected sockets. A client connected to instance B receives an update
triggered by a reservation made through instance A, with **no direct connection between the two
backend processes** — Redis is the only thing they share for this.

Verified, not just designed this way: two backend instances were started on different ports
(4000 and 4001) against one shared MongoDB and one shared Redis. A socket client connected only to
instance B, a reservation request was sent to instance A's REST API, and instance B's client
received `seats:updated` with the correct seat and status — proving the fan-out works with zero
coupling between instances beyond the shared Redis and MongoDB deployments.

---

## Third-Party Booking API

A separate route namespace (planned: `/api/partner/v1/reservations`) will let external systems
reserve seats under the same rules as the frontend, authenticated via a simple API key
(`x-api-key` header checked against `PARTNER_API_KEY`). It calls the identical
`reserveSeats(...)` service function described above — see that section for why this prevents
double-booking across the two traffic sources.

---

## High-Concurrency Simulation

A load-test script (planned: `backend/src/simulation/simulate.ts`) will spin up 100 concurrent
"users," split roughly 50/50 between the frontend API and the partner API, all targeting the same
small pool of seats on purpose. After the run it will report attempts, successes, conflicts, and a
DB consistency check (`available + reserved === 50`, no seat double-assigned). Instructions and
sample output will be added here once Phase 6 lands.

---

## Assumptions

- Single movie, single showing, exactly 50 fixed seats — no scheduling/multi-show complexity.
- `userId` is self-declared (no mandatory authentication) since auth isn't a hard requirement.
- No payment flow — a "reservation" is the end state, not a booking-then-payment pipeline.
- No seat "holding" during checkout by default — a seat is either `available` or `reserved`;
  reservation expiration (bonus) is the natural extension if implemented.

## Trade-offs

- **MongoDB transactions require a replica set**, even in local dev — an added setup step in
  exchange for atomic multi-seat guarantees.
- **Socket.IO + Redis adds an operational dependency** purely to make real-time updates correct
  across multiple backend instances — justified because multi-instance correctness is an explicit
  requirement of this assessment.
- The optimistic `version` field on `Seat` is technically redundant with the conditional
  `status: 'available'` filter for this scenario's needs, but is kept as defense-in-depth and to
  make future extensions (e.g. seat holds with TTL) safer to build on.

---

## License

Not applicable — this is an engineering assessment submission.
