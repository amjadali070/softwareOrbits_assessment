# Real-Time Cinema Seat Reservation System

A production-grade, real-time cinema seat reservation system built with TypeScript, Express,
MongoDB, Next.js, and Socket.IO.

Designed to maintain strict atomicity and zero double-bookings under high concurrency across multiple
backend instances behind a load balancer.

Correctness and concurrency handling are the focus of this project — not UI polish.

---

## Tech Stack

| Layer      | Choice                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| Language   | TypeScript (strict mode) end-to-end                                             |
| Frontend   | Next.js (App Router) + React                                                    |
| Backend    | Express.js                                                                      |
| Database   | MongoDB + Mongoose (replica set — required for transactions)                    |
| Real-time  | Socket.IO + `@socket.io/redis-adapter` + Redis                                  |
| Auth       | Minimal JWT (`jsonwebtoken`) on the frontend path                               |
| Testing    | Vitest + Supertest + Playwright (manual browser verification)                   |
| Tooling    | ESLint (flat config) + Prettier (shared root config)                            |
| Containers | Docker + Docker Compose (Mongo replica set, Redis, 2× backend, nginx, frontend) |

---

## Repository Structure

```
.
├── backend/                 Express + TypeScript API
│   ├── src/
│   │   ├── app.ts           Express app factory
│   │   ├── server.ts        HTTP server entrypoint
│   │   ├── config/          env loading, db connection
│   │   ├── models/          Mongoose schemas (Seat, Reservation)
│   │   ├── services/        reservation.service.ts (shared booking logic),
│   │   │                    simulation.service.ts, expiration.service.ts, auth.service.ts
│   │   ├── routes/          frontend, partner, auth, and simulation route handlers
│   │   ├── middleware/      error handling, partner API-key auth, JWT auth
│   │   ├── realtime/        Socket.IO + Redis adapter setup
│   │   └── simulation/      concurrency load-test script
│   ├── Dockerfile
│   └── .env.example
├── frontend/                 Next.js + TypeScript UI
│   ├── src/
│   │   ├── app/             App Router pages
│   │   ├── components/      SeatGrid, ReservationPanel
│   │   ├── lib/             API client, socket client, userId persistence
│   │   └── types/           DTOs mirroring the backend's response shapes
│   ├── Dockerfile
│   └── .env.example
├── nginx/default.conf        Load balancer config (round-robins the two backend instances)
├── docker-compose.yml         Full stack: Mongo (replica set) + Redis + 2× backend + nginx + frontend
├── .prettierrc.json          Shared formatting config (both apps inherit it)
└── README.md
```

`backend/` and `frontend/` are independent npm projects (no workspaces) — each has its own
`package.json`, dependencies, and scripts.

---

## Getting Started

**Fastest path**: `docker compose up --build` runs the entire stack (Mongo, Redis, two backend
instances, an nginx load balancer, and the frontend) in one command — see
[Docker](#docker) for the full breakdown. The steps below are for running everything natively
instead (useful for development, since `npm run dev` gives hot-reload that the containers don't).

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

| Variable                       | Purpose                                                                                                              | Default (example)                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `PORT`                         | HTTP port for the Express server                                                                                     | `4000`                                            |
| `MONGO_URI`                    | MongoDB connection string (replica set)                                                                              | `mongodb://127.0.0.1:27017/cinema?replicaSet=rs0` |
| `REDIS_URL`                    | Redis connection string (Socket.IO adapter + pub/sub)                                                                | `redis://127.0.0.1:6379`                          |
| `PARTNER_API_KEY`              | Shared secret third-party callers must send                                                                          | `partner-secret-key`                              |
| `CORS_ORIGIN`                  | Allowed origin for the frontend                                                                                      | `http://localhost:3000`                           |
| `JWT_SECRET`                   | Signs/verifies frontend auth tokens — **must be identical across every backend instance**, same as `PARTNER_API_KEY` | `dev-only-jwt-secret-change-me`                   |
| `JWT_EXPIRES_IN`               | Token lifetime                                                                                                       | `24h`                                             |
| `RESERVATION_TTL_MS`           | How long a confirmed reservation lives before the expiration sweep releases it                                       | `300000` (5 min)                                  |
| `EXPIRATION_SWEEP_INTERVAL_MS` | How often the expiration sweep runs                                                                                  | `15000` (15 sec)                                  |

**`frontend/.env`**

| Variable                 | Purpose                           |
| ------------------------ | --------------------------------- |
| `NEXT_PUBLIC_API_URL`    | Base URL of the backend REST API  |
| `NEXT_PUBLIC_SOCKET_URL` | Base URL for the Socket.IO client |

---

## Available Scripts

**Backend** (`cd backend`)

| Command            | Description                                       |
| ------------------ | ------------------------------------------------- |
| `npm run dev`      | Start the API with hot-reload (`ts-node-dev`)     |
| `npm run build`    | Type-check and compile to `dist/`                 |
| `npm start`        | Run the compiled build (`dist/server.js`)         |
| `npm run lint`     | ESLint over `src/`                                |
| `npm run format`   | Format `src/` with Prettier                       |
| `npm test`         | Run the Vitest suite                              |
| `npm run seed`     | Wipe and re-seed the DB with 50 available seats   |
| `npm run simulate` | Run the 100-concurrent-user load test (see below) |

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

### `POST /api/auth/login`

Body: `{ "userId": string }`. No password — `userId` is still self-declared (see
[Assumptions](#assumptions)); this just issues a signed token asserting that identity for
subsequent requests. `200`:

```json
{ "token": "<jwt>", "userId": "alice" }
```

`400` `INVALID_INPUT` if `userId` is missing/blank.

### `POST /api/reservations` (frontend path)

Requires `Authorization: Bearer <token>` (from `/api/auth/login`) — missing or invalid → `401`
`UNAUTHORIZED`. Body: `{ "userId": string, "seatIds": string[] }`; the authenticated token's
`userId` always wins over the body's, so a request can't book on behalf of a different identity
than the one it authenticated as.

An optional `Idempotency-Key` header makes retries safe: replaying the exact same key returns the
original reservation instead of attempting to book again (see
[Retry safety](#retry-safety-idempotency-keys)).

| Outcome                         | Status | Body                                                                                    |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Booked                          | `201`  | `{ "reservation": { reservationId, userId, seats, source, status, createdAt } }`        |
| One or more seats already taken | `409`  | `{ "error": { "code": "SEATS_UNAVAILABLE", "message", "conflictingSeats": string[] } }` |
| Unknown seat id(s)              | `400`  | `{ "error": { "code": "INVALID_SEATS", "message", "invalidSeatIds": string[] } }`       |
| Malformed body (empty/missing)  | `400`  | `{ "error": { "code": "INVALID_INPUT", "message", "details" } }`                        |
| Missing/invalid token           | `401`  | `{ "error": { "code": "UNAUTHORIZED", "message" } }`                                    |

A conflict never partially books — if any requested seat is unavailable, none of the seats in that
request are reserved (see [Concurrency strategy](#concurrency-strategy)).

### `DELETE /api/reservations/:reservationId`

Requires the same `Authorization` header as booking. Cancels a reservation you made, releasing its
seats back to `available`.

| Outcome                                 | Status | Body                                                    |
| --------------------------------------- | ------ | ------------------------------------------------------- |
| Cancelled                               | `200`  | `{ "reservation": { ..., "status": "cancelled" } }`     |
| Reservation belongs to a different user | `403`  | `{ "error": { "code": "FORBIDDEN", "message" } }`       |
| No such reservation                     | `404`  | `{ "error": { "code": "NOT_FOUND", "message" } }`       |
| Already cancelled or expired            | `409`  | `{ "error": { "code": "NOT_CANCELLABLE", "message" } }` |

### `POST /api/partner/v1/reservations` (third-party path)

Identical contract and status codes to the frontend reservation route, plus a required header
instead of a bearer token:

```
x-api-key: <PARTNER_API_KEY>
```

Missing or wrong key → `401` `{ "error": { "code": "UNAUTHORIZED", "message" } }`. Otherwise this
route calls the exact same booking function as the frontend route — see
[Shared booking logic](#shared-booking-logic-frontend--third-party-parity).

### `DELETE /api/partner/v1/reservations/:reservationId`

Same contract as the frontend cancellation route, gated by `x-api-key` instead of a bearer token,
calling the same `cancelReservation()` function.

### `POST /api/simulation/run`

Body: `{ "userCount": number }` (default `100`). Triggers a high-concurrency simulation of 100 simultaneous reservation attempts split 50/50 between frontend and partner routes against a shared seat pool, verifying database consistency directly against MongoDB.

`200`:
```json
{
  "simulation": {
    "ok": true,
    "totalAttempts": 100,
    "successful": 10,
    "successfulFrontend": 6,
    "successfulPartner": 4,
    "conflicts": 90,
    "errors": 0,
    "elapsedMs": 1451,
    "doubleBookedCount": 0
  }
}
```

### `GET /health`

Liveness check, `200` `{ "status":"ok" }` — not part of the seat/reservation API surface.

### Real-time events (Socket.IO)

Connect a Socket.IO client to the backend's base URL (no separate path/namespace).

| Event            | Direction       | Payload                       | When                                                                                                                                                                              |
| ---------------- | --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seats:snapshot` | server → client | `{ seats: SeatDTO[] }`        | Once, right after a client connects — full current seat state so a freshly opened tab doesn't have to wait for the next reservation.                                              |
| `seats:updated`  | server → client | `{ seats: { id, status }[] }` | After every successful reservation, cancellation, or expiration sweep — on **every** connected client, regardless of which backend instance handled it or which client caused it. |

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
reserveSeats(
  userId: string,
  seatIds: string[],
  source: 'frontend' | 'partner',
  idempotencyKey?: string,
): Promise<ReservationResult>
```

This function is the single source of truth for booking rules and lives in
`backend/src/services/reservation.service.ts`. Rather than relying on two separately-written
controllers happening to look similar, `backend/src/routes/reservationHandler.ts` exports
**one** `createReservationHandler(source)` factory that both routes mount:

```ts
// reservations.routes.ts (frontend)
router.post(
  '/',
  authenticate,
  validateBody(reserveSeatsRequestSchema),
  createReservationHandler('frontend'),
);

// partner.routes.ts (third-party)
router.post(
  '/v1/reservations',
  partnerAuth,
  validateBody(reserveSeatsRequestSchema),
  createReservationHandler('partner'),
);
```

The only differences between the two routes are the URL, which auth middleware sits in front
(JWT for frontend, an API key for partner), and the `source` tag passed through to
`reserveSeats`. There is no second implementation of booking rules to drift out of sync — this is
what guarantees a partner request and a frontend request racing for the same seat are resolved by
the exact same code path and the exact same database-level guarantee. Verified live: 10 concurrent
requests (5 via each route) targeting one seat produced exactly one `201` and nine `409`s, and a
direct partner-vs-frontend conflict test (reserve via frontend, then try the same seat via
partner) correctly returned `409`. Cancellation mirrors this: `createCancellationHandler()` is
the same kind of shared factory, mounted by both `DELETE` routes.

### Reservation expiration

Every reservation gets `expiresAt = createdAt + RESERVATION_TTL_MS` (default 5 minutes) when it's
created — there's no separate "hold" state in this system (see
[Trade-offs](#trade-offs)), so expiration is retrofitted onto the existing `confirmed` status
instead. A background sweep (`services/expiration.service.ts`, `startExpirationSweep()`, run on
an interval from `server.ts`) periodically finds reservations past their `expiresAt` that are
still `confirmed`, and — one MongoDB transaction per reservation, re-checking `status: 'confirmed'`
inside the transaction — releases their seats back to `available` and marks the reservation
`expired`, then broadcasts `seats:updated` exactly like a normal booking. Re-checking status
inside the transaction is what makes this safe to race against a concurrent cancellation or
another sweep tick: whichever gets there first wins, the other finds the status has already
changed and does nothing.

### Reservation cancellation

`cancelReservation(reservationId, userId)` is the cancellation counterpart to `reserveSeats` —
same file, same transactional approach, same "no in-process locking" reasoning. It checks the
reservation exists, checks the caller's `userId` matches the reservation's `userId` (`403` if
not), checks it's still `confirmed` (`409` `NOT_CANCELLABLE` if already cancelled/expired), then
releases the seats and marks it `cancelled` — all inside one transaction, followed by the same
`seats:updated` broadcast every other write path uses.

### Retry safety (idempotency keys)

`reserveSeats` accepts an optional `idempotencyKey`. A request retried with the same key (e.g. a
client that timed out waiting for a response, but whose first attempt actually landed
server-side) returns the _original_ reservation instead of attempting to book again — this is
checked once up front (fast path for the common sequential-retry case), and enforced for real by
a unique sparse index on `Reservation.idempotencyKey`: if two requests sharing a key somehow reach
`Reservation.create` concurrently, the loser's insert fails with a duplicate-key error, its
transaction (including its own seat updates) rolls back automatically, and it re-reads the
winner's reservation instead of erroring. What this guarantees is **never more than one
reservation per key** — not that every concurrent racer with the same key succeeds identically,
since concurrent requests can still legitimately lose the underlying seat race before the
idempotency check ever comes into play (see the test suite's own commentary on this in
`app.integration.test.ts`). The frontend sends a fresh key per submit via `crypto.randomUUID()`.

### Authentication

Deliberately minimal, per the brief's own "minimal JWT/session flow" framing: `POST /api/auth/login`
takes a bare `userId` — no password — and returns a signed JWT. `userId` is still self-declared
(see [Assumptions](#assumptions)); what changes is that once a client has a token, the server
trusts the token's `userId` claim over whatever a request body claims, closing the gap where
anyone could previously book a seat under any name. The `authenticate` middleware sits in front
of the frontend reservation and cancellation routes only — the partner path keeps its API-key
auth, which is a different, already-adequate trust boundary (a B2B integration authenticates as
the partner, not as an individual end user, so per-request JWTs don't apply there).

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

### Frontend state management

There's a single `seats` array in `app/page.tsx`, kept in sync by two independent sources: an
initial `GET /api/seats` fetch for fast first paint, and the socket's `seats:snapshot` /
`seats:updated` events afterward — both write into the same state, so whichever arrives first
wins and the other reconciles on top of it. Selection (`Set<string>` of seat IDs) is separate
local UI state; the socket handler proactively removes a seat from the current selection the
moment it's reported `reserved` by anyone (not just the current user), so a user can never submit
a request for a seat the UI already knows is gone.

**Optimistic updates**: on submit, the selected seats are immediately marked `reserved` in local
state (and cleared from selection) _before_ the request resolves, rather than waiting on the round
trip. If the request succeeds, nothing further is needed — the state's already correct, and the
`seats:updated` broadcast that arrives shortly after is a harmless no-op merge, same as it would
be for any other client. If it fails, the seats that were optimistically marked are rolled back to
`available` — except any the server actually reports in `conflictingSeats`, which really are taken
by someone else and should stay marked `reserved`. Since booking is all-or-nothing, a failure
never partially succeeds, so this rollback logic doesn't need to guess.

---

## High-Concurrency Simulation

The system provides **two mechanisms** to execute high-concurrency simulations:

1. **Interactive UI Trigger Button**: A **"Simulate 100 Users"** white button in the frontend header navbar triggers `POST /api/simulation/run` on the backend. It executes 100 concurrent requests, streams live seat updates to every connected browser tab via Socket.IO, and displays a summary result banner.
2. **CLI Script (`npm run simulate`)**: `backend/src/simulation/simulate.ts` fires 100 concurrent "virtual users" at a small, deliberately overlapping pool of seats (default: `A1`–`A10` — 10 seats for 100 users guarantees heavy contention). Each user requests 1–3 random seats from that pool. Requests are split exactly 50/50 between `POST /api/reservations` (frontend) and `POST /api/partner/v1/reservations` (partner), fired together via `Promise.all`, not sequentially.

Before running, it resets the target seat pool to `available` so the run is repeatable; afterward, it queries MongoDB directly — not the HTTP responses — to verify no seat was referenced by more than one reservation, and that `available + reserved` still equals the seat count, both for the pool and for the whole 50-seat table.

### Running it via CLI

```bash
cd backend
npm run seed        # first time only, or to reset the whole table
npm run simulate     # targets http://localhost:4000 by default
```

**Against multiple instances** (to prove the multi-instance guarantee, not just assert it) — start
two backend processes on different ports against the same Mongo + Redis, then point the script at
both; it round-robins requests across whatever's listed:

```bash
PORT=4000 npm run dev &
PORT=4001 npm run dev &
SIMULATION_TARGETS="http://localhost:4000,http://localhost:4001" npm run simulate
```

Optional env vars: `SIMULATION_USERS` (default `100`), `SIMULATION_SEAT_POOL` (default `A1..A10`,
comma-separated), `SIMULATION_TARGETS` (default `http://localhost:4000`, comma-separated).

### Actual output

Run against a **single instance**:

```
Simulation: 100 concurrent users, pool = [A1, A2, A3, A4, A5, A6, A7, A8, A9, A10], targets = [http://localhost:4000]
Reset pool of 10 seats to available.

--- Results ---
Total attempts:      100
Successful (201):    9  (frontend: 4, partner: 5)
Conflicts (409):     91
Bad requests (400):  0
Errors:              0
Elapsed:             2252ms

--- DB Consistency ---
Pool (10 seats): available=0, reserved=10, sum=10
Whole table (50 seats): available=40, reserved=10, sum=50
Reservations touching pool: 9
Seats referenced by more than one reservation (double-booked): 0

PASS: simulation completed with full consistency and no errors.
```

Run against **two live backend instances** (ports 4000 and 4001, same Mongo + Redis), a fresh
pool, requests round-robined across both:

```
Simulation: 100 concurrent users, pool = [B1, B2, B3, B4, B5, B6, B7, B8, B9, B10], targets = [http://localhost:4000, http://localhost:4001]
Reset pool of 10 seats to available.

--- Results ---
Total attempts:      100
Successful (201):    9  (frontend: 7, partner: 2)
Conflicts (409):     91
Bad requests (400):  0
Errors:              0
Elapsed:             1661ms

--- DB Consistency ---
Pool (10 seats): available=0, reserved=10, sum=10
Whole table (50 seats): available=40, reserved=10, sum=50
Reservations touching pool: 9
Seats referenced by more than one reservation (double-booked): 0

PASS: simulation completed with full consistency and no errors.
```

Zero double-bookings in both runs — the second run proves it holds when requests are actually
split across two independent backend processes, not just asserted in prose.

---

## Bonus Features

All optional items from the brief are implemented. Design and reasoning for most of them live
inline above, next to the code they describe:

- **Reservation expiration** — [Reservation expiration](#reservation-expiration)
- **Reservation cancellation** — [Reservation cancellation](#reservation-cancellation),
  `DELETE /api/reservations/:id` in the [API Reference](#api-reference)
- **Retry mechanism** — [Retry safety (idempotency keys)](#retry-safety-idempotency-keys)
- **Authentication** — [Authentication](#authentication)
- **Optimistic UI updates** — [Frontend state management](#frontend-state-management)
- **Docker setup** — this section

### Docker

`docker-compose.yml` runs the entire stack in one command: a single-node Mongo replica set
(auto-initiated by a one-shot `mongo-init` container), Redis, **two separate backend instances**
(not `--scale` — each gets its own stable host port, which is what actually lets you hit them
individually to prove the multi-instance story) behind an **nginx load balancer** that round-robins
between them and proxies WebSocket upgrades correctly, a one-shot `seed` container, and the
frontend.

```bash
docker compose up --build
```

| Service    | Host port | What                                                                                                        |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `frontend` | `3000`    | The UI — open this in a browser                                                                             |
| `nginx`    | `8080`    | Load balancer in front of both backend instances (what the frontend and simulation script actually talk to) |
| `backend1` | `4000`    | Direct access to instance 1 (bypasses the load balancer, for debugging)                                     |
| `backend2` | `4001`    | Direct access to instance 2                                                                                 |
| `mongo`    | `27017`   | Direct DB access if needed                                                                                  |
| `redis`    | `6379`    | Direct Redis access if needed                                                                               |

To run the concurrency simulation against the containerized load-balanced stack instead of a
local instance:

```bash
SIMULATION_TARGETS=http://localhost:8080 npm run simulate   # from backend/, needs local Node + this repo's deps
```

---

## Assumptions

- Single movie, single showing, exactly 50 fixed seats — no scheduling/multi-show complexity.
- `userId` is self-declared — there's no password or identity verification anywhere in this
  system. The bonus JWT layer (see [Authentication](#authentication)) makes that identity
  _tamper-evident_ once issued (a request can't silently claim to be a different already-logged-in
  user), but it does not make `userId` a verified real-world identity; anyone can still declare
  any `userId` and log in as it.
- No payment flow — a "reservation" is the end state, not a booking-then-payment pipeline.
- A reservation is either `confirmed`, `expired`, or `cancelled` — there's no separate "hold"
  state during checkout; the expiration bonus is retrofitted onto `confirmed` reservations instead
  (see [Reservation expiration](#reservation-expiration)).

---

## Trade-offs

- **MongoDB transactions require a replica set**, even in local dev — an added setup step in
  exchange for atomic multi-seat guarantees.
- **Socket.IO + Redis adds an operational dependency** purely to make real-time updates correct
  across multiple backend instances — justified because multi-instance correctness is an explicit
  requirement of this assessment.
- The optimistic `version` field on `Seat` is technically redundant with the conditional
  `status: 'available'` filter for this scenario's needs, but is kept as defense-in-depth and to
  make future extensions (e.g. seat holds with TTL) safer to build on.
- `setupRealtime()` returns a `close()` alongside `io`, and `server.ts` wires it into a
  `SIGTERM`/`SIGINT` handler that closes the Socket.IO server, quits both Redis clients, and
  disconnects Mongoose before exiting. This wasn't in the original plan — it fell out of needing
  the real-time integration test to shut down cleanly instead of leaking Redis connections and
  hanging the test runner, and it happens to also make production shutdowns graceful for free.
- **The default 5-minute reservation TTL applies to every booking**, not just an intermediate
  "hold" — a seat reserved through this UI really will release itself 5 minutes later unless
  cancelled or otherwise acted on. That's a deliberate reading of the brief's own bonus wording
  ("automatically release seats after 5 minutes"), not an accident; `RESERVATION_TTL_MS` is
  there to turn it down or up. Worth knowing if you're manually testing and a seat you booked
  disappears out from under you a few minutes later — that's expiration working, not a bug.
- **Idempotency keys guarantee at most one reservation per key**, not that every concurrent
  request sharing a key succeeds — see [Retry safety](#retry-safety-idempotency-keys) for why
  that's the correct guarantee to make rather than a limitation of the implementation.
- **`JWT_SECRET` and `PARTNER_API_KEY` must be identical across every backend instance** for
  tokens/keys issued or accepted by one instance to work against another — same requirement as
  `MONGO_URI`/`REDIS_URL` already have, just for the auth layer. The Docker Compose stack sets
  this via a shared YAML anchor so every service gets the same value automatically.

---

## License

Not applicable — this is an engineering assessment submission.
