import { connectDB, disconnectDB } from '../config/db';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { env } from '../config/env';

type Source = 'frontend' | 'partner';

type Outcome = {
  index: number;
  source: Source;
  target: string;
  seatIds: string[];
  status: number | 'ERROR';
  ok: boolean;
  errorCode?: string;
};

function parseListEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Deliberately overlapping: a small pool shared by every simulated user, so most requests
// collide with each other, exactly as the brief describes ("many users intentionally attempt
// to reserve the same seats").
const DEFAULT_POOL = Array.from({ length: 10 }, (_, i) => `A${i + 1}`);

const TARGETS = parseListEnv('SIMULATION_TARGETS', ['http://localhost:4000']);
const SEAT_POOL = parseListEnv('SIMULATION_SEAT_POOL', DEFAULT_POOL);
const USER_COUNT = parseIntEnv('SIMULATION_USERS', 100);

function pickRandomSeats(pool: string[]): string[] {
  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 3)); // 1-3 seats
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function resetPool(pool: string[]): Promise<void> {
  const result = await Seat.updateMany(
    { _id: { $in: pool } },
    { $set: { status: 'available', reservationId: null }, $inc: { version: 1 } },
  );
  if (result.matchedCount !== pool.length) {
    console.warn(
      `Warning: only matched ${result.matchedCount}/${pool.length} pool seats — has the DB been seeded? (npm run seed)`,
    );
  }
}

async function fireRequest(
  index: number,
  target: string,
  source: Source,
  seatIds: string[],
): Promise<Outcome> {
  const path = source === 'frontend' ? '/api/reservations' : '/api/partner/v1/reservations';
  const userId = `sim-user-${index}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (source === 'partner') headers['x-api-key'] = env.partnerApiKey;

  try {
    const res = await fetch(`${target}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, seatIds }),
    });
    const body = (await res.json()) as { error?: { code?: string } };
    if (res.ok) {
      return { index, source, target, seatIds, status: res.status, ok: true };
    }
    return { index, source, target, seatIds, status: res.status, ok: false, errorCode: body.error?.code };
  } catch (err) {
    return {
      index,
      source,
      target,
      seatIds,
      status: 'ERROR',
      ok: false,
      errorCode: err instanceof Error ? err.message : 'UNKNOWN',
    };
  }
}

async function main() {
  console.log(
    `Simulation: ${USER_COUNT} concurrent users, pool = [${SEAT_POOL.join(', ')}], targets = [${TARGETS.join(', ')}]`,
  );

  await connectDB();
  await resetPool(SEAT_POOL);
  console.log(`Reset pool of ${SEAT_POOL.length} seats to available.\n`);

  const requests = Array.from({ length: USER_COUNT }, (_, i) => ({
    index: i,
    source: (i % 2 === 0 ? 'frontend' : 'partner') as Source,
    target: TARGETS[i % TARGETS.length] as string,
    seatIds: pickRandomSeats(SEAT_POOL),
  }));

  const startedAt = Date.now();
  const outcomes = await Promise.all(
    requests.map((r) => fireRequest(r.index, r.target, r.source, r.seatIds)),
  );
  const elapsedMs = Date.now() - startedAt;

  const successes = outcomes.filter((o) => o.ok);
  const conflicts = outcomes.filter((o) => !o.ok && o.status === 409);
  const badRequests = outcomes.filter((o) => !o.ok && o.status === 400);
  const errors = outcomes.filter(
    (o) => !o.ok && (o.status === 'ERROR' || (typeof o.status === 'number' && o.status >= 500)),
  );

  const successesBySource = {
    frontend: successes.filter((o) => o.source === 'frontend').length,
    partner: successes.filter((o) => o.source === 'partner').length,
  };

  console.log('--- Results ---');
  console.log(`Total attempts:      ${outcomes.length}`);
  console.log(
    `Successful (201):    ${successes.length}  (frontend: ${successesBySource.frontend}, partner: ${successesBySource.partner})`,
  );
  console.log(`Conflicts (409):     ${conflicts.length}`);
  console.log(`Bad requests (400):  ${badRequests.length}`);
  console.log(`Errors:              ${errors.length}`);
  console.log(`Elapsed:             ${elapsedMs}ms`);

  // Consistency, checked directly against MongoDB rather than trusting the HTTP responses alone.
  const poolSeats = await Seat.find({ _id: { $in: SEAT_POOL } }).lean();
  const poolAvailable = poolSeats.filter((s) => s.status === 'available').length;
  const poolReserved = poolSeats.filter((s) => s.status === 'reserved').length;

  const poolReservations = await Reservation.find({ seats: { $in: SEAT_POOL } }).lean();
  const seatReferenceCount = new Map<string, number>();
  for (const reservation of poolReservations) {
    for (const seatId of reservation.seats) {
      if (SEAT_POOL.includes(seatId)) {
        seatReferenceCount.set(seatId, (seatReferenceCount.get(seatId) ?? 0) + 1);
      }
    }
  }
  const doubleBooked = [...seatReferenceCount.entries()].filter(([, count]) => count > 1);

  const allSeats = await Seat.find().lean();
  const totalAvailable = allSeats.filter((s) => s.status === 'available').length;
  const totalReserved = allSeats.filter((s) => s.status === 'reserved').length;

  console.log('\n--- DB Consistency ---');
  console.log(
    `Pool (${SEAT_POOL.length} seats): available=${poolAvailable}, reserved=${poolReserved}, sum=${poolAvailable + poolReserved}`,
  );
  console.log(
    `Whole table (${allSeats.length} seats): available=${totalAvailable}, reserved=${totalReserved}, sum=${totalAvailable + totalReserved}`,
  );
  console.log(`Reservations touching pool: ${poolReservations.length}`);
  console.log(`Seats referenced by more than one reservation (double-booked): ${doubleBooked.length}`);
  if (doubleBooked.length > 0) {
    console.error('DOUBLE-BOOKING DETECTED:', doubleBooked);
  }

  const consistent =
    poolAvailable + poolReserved === SEAT_POOL.length &&
    totalAvailable + totalReserved === allSeats.length &&
    doubleBooked.length === 0;
  const pass = consistent && errors.length === 0;

  console.log(
    `\n${pass ? 'PASS' : 'FAIL'}: simulation completed ${pass ? 'with full consistency and no errors.' : '— see issues above.'}`,
  );

  await disconnectDB();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
