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
- [ ] **Phase 3** — Backend REST APIs (frontend-facing + third-party partner)
- [ ] **Phase 4** — Real-time layer (Socket.IO + Redis adapter, multi-instance fan-out)
- [ ] **Phase 5** — Frontend seat map UI
- [ ] **Phase 6** — High-concurrency simulation (100 concurrent users)
- [ ] **Phase 7** — Automated tests
- [ ] **Phase 8+** — Bonus items (reservation expiration, Docker, cancellation, etc.)

This section will be kept up to date as phases land, and the sections below (setup, scripts,
architecture) reflect the current implementation, not the finished aspiration.

---

## Tech Stack

| Layer     | Choice                                                           |
| --------- | ---------------------------------------------------------------- |
| Language  | TypeScript (strict mode) end-to-end                              |
| Frontend  | Next.js (App Router) + React                                     |
| Backend   | Express.js                                                       |
| Database  | MongoDB + Mongoose (replica set — required for transactions)     |
| Real-time | Socket.IO + `@socket.io/redis-adapter` + Redis (planned Phase 4) |
| Testing   | Vitest + Supertest                                               |
| Tooling   | ESLint (flat config) + Prettier (shared root config)             |

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
- Redis — required starting Phase 4

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

Both the frontend-facing route and the third-party partner route will call **one function**
(routes land in Phase 3; the function itself already exists and is fully tested independent of
any HTTP layer):

```ts
reserveSeats(userId: string, seatIds: string[], source: 'frontend' | 'partner'): Promise<ReservationResult>
```

This function is the single source of truth for booking rules and lives in
`backend/src/services/reservation.service.ts`. The two Express routes will be thin controllers
that validate input, call this function, and translate the result into an HTTP response. Neither
route will implement its own booking logic — this is what guarantees a partner request and a
frontend request racing for the same seat are resolved by the exact same code path and the exact
same database-level guarantee.

### Correctness across multiple backend instances

Correctness does **not** rely on anything in-process — no in-memory locks, no mutex, no
single-instance queue. It comes entirely from MongoDB's atomic operations and transaction
guarantees at the database layer, which every backend instance shares. Two Node processes on two
different machines calling the same `findOneAndUpdate` / transaction against the same MongoDB
deployment are safe by construction: MongoDB itself serializes the conflicting writes. Horizontal
scaling of the API layer is safe precisely because none of the correctness logic lives in that
layer.

### Real-time updates across instances

Each backend instance runs its own Socket.IO server, but all instances share a Redis pub/sub
channel via `@socket.io/redis-adapter`. When any instance commits a reservation, it emits
`seats:updated`; Redis fans that event out to every connected client on every instance — so a
browser connected to instance B still sees a reservation made through instance A, with no polling
or refresh required.

_(Real-time layer lands in Phase 4 — this section describes the design; implementation status is
tracked above.)_

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
