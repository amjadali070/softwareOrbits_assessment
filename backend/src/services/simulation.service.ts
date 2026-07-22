import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { reserveSeats } from './reservation.service';
import { seatEvents } from '../realtime/events';

type SimulationResult = {
  ok: boolean;
  totalAttempts: number;
  successful: number;
  successfulFrontend: number;
  successfulPartner: number;
  conflicts: number;
  errors: number;
  elapsedMs: number;
  doubleBookedCount: number;
};

const DEFAULT_POOL = Array.from({ length: 10 }, (_, i) => `A${i + 1}`);

function pickRandomSeats(pool: string[]): string[] {
  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function runSimulation(
  userCount = 100,
  poolSeatIds = DEFAULT_POOL,
): Promise<SimulationResult> {
  const startedAt = Date.now();

  // 1. Reset pool seats and clear old reservation records for clean simulation
  await Reservation.deleteMany({ seats: { $in: poolSeatIds } });
  await Seat.updateMany(
    { _id: { $in: poolSeatIds } },
    { $set: { status: 'available', reservationId: null }, $inc: { version: 1 } },
  );

  // Broadcast initial reset to connected socket clients
  seatEvents.emitSeatsUpdated({
    seats: poolSeatIds.map((id) => ({ id, status: 'available' as const })),
  });

  // 2. Build 100 concurrent requests split 50/50 between frontend and partner
  const requests = Array.from({ length: userCount }, (_, i) => {
    const userId = `sim-user-${i + 1}`;
    const source = i % 2 === 0 ? ('frontend' as const) : ('partner' as const);
    const seatIds = pickRandomSeats(poolSeatIds);

    return reserveSeats(userId, seatIds, source);
  });

  // 3. Fire all 100 concurrent requests
  const results = await Promise.all(requests);
  const elapsedMs = Date.now() - startedAt;

  let successful = 0;
  let successfulFrontend = 0;
  let successfulPartner = 0;
  let conflicts = 0;
  let errors = 0;

  results.forEach((res, i) => {
    const source = i % 2 === 0 ? 'frontend' : 'partner';
    if (res.ok) {
      successful++;
      if (source === 'frontend') successfulFrontend++;
      else successfulPartner++;
    } else if (res.reason === 'SEATS_UNAVAILABLE') {
      conflicts++;
    } else {
      errors++;
    }
  });

  // 4. Verify Database Consistency directly against MongoDB
  const poolReservations = await Reservation.find({
    seats: { $in: poolSeatIds },
    status: 'confirmed',
  }).lean();

  const seatReferenceCount = new Map<string, number>();
  for (const reservation of poolReservations) {
    for (const seatId of reservation.seats) {
      if (poolSeatIds.includes(seatId)) {
        seatReferenceCount.set(seatId, (seatReferenceCount.get(seatId) ?? 0) + 1);
      }
    }
  }
  const doubleBooked = [...seatReferenceCount.entries()].filter(([, count]) => count > 1);

  return {
    ok: errors === 0 && doubleBooked.length === 0,
    totalAttempts: userCount,
    successful,
    successfulFrontend,
    successfulPartner,
    conflicts,
    errors,
    elapsedMs,
    doubleBookedCount: doubleBooked.length,
  };
}
