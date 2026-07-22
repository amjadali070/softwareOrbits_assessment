import mongoose from 'mongoose';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { seatEvents } from '../realtime/events';

/**
 * Releases seats for reservations whose expiresAt has passed. Each reservation is handled in its
 * own transaction (re-checking status: 'confirmed' inside the transaction) so this can never race
 * incorrectly against a concurrent cancellation or another sweep tick — whichever gets there
 * first wins, the other finds status is no longer 'confirmed' and does nothing.
 */
export async function sweepExpiredReservations(): Promise<number> {
  const now = new Date();
  const expired = await Reservation.find({
    status: 'confirmed',
    expiresAt: { $ne: null, $lte: now },
  });

  let releasedCount = 0;

  for (const candidate of expired) {
    const session = await mongoose.startSession();
    let releasedSeatIds: string[] = [];

    try {
      await session.withTransaction(async () => {
        const fresh = await Reservation.findOne({
          _id: candidate._id,
          status: 'confirmed',
        }).session(session);
        if (!fresh) return; // already cancelled or already swept

        const seatsToRelease = await Seat.find(
          { reservationId: fresh.reservationId, status: 'reserved' },
          { _id: 1 },
        ).session(session);
        releasedSeatIds = seatsToRelease.map((s) => s._id);

        if (releasedSeatIds.length > 0) {
          await Seat.updateMany(
            { reservationId: fresh.reservationId, status: 'reserved' },
            { $set: { status: 'available', reservationId: null }, $inc: { version: 1 } },
            { session },
          );
        }

        fresh.status = 'expired';
        await fresh.save({ session });
      });
    } finally {
      await session.endSession();
    }

    if (releasedSeatIds.length > 0) {
      seatEvents.emitSeatsUpdated({
        seats: releasedSeatIds.map((id) => ({ id, status: 'available' as const })),
      });
      releasedCount += releasedSeatIds.length;
    }
  }

  return releasedCount;
}

export function startExpirationSweep(intervalMs: number): () => void {
  const timer = setInterval(() => {
    sweepExpiredReservations().catch((err) => console.error('Expiration sweep failed:', err));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
