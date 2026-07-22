import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Seat } from '../models/Seat';
import { Reservation, ReservationSource } from '../models/Reservation';
import { seatEvents } from '../realtime/events';
import type { ReservationDTO, ReservationResult, SeatDTO } from '../types/reservation.types';

class SeatsUnavailableError extends Error {
  constructor(public readonly conflictingSeats: string[]) {
    super('SEATS_UNAVAILABLE');
    this.name = 'SeatsUnavailableError';
  }
}

class InvalidSeatsError extends Error {
  constructor(public readonly invalidSeatIds: string[]) {
    super('INVALID_SEATS');
    this.name = 'InvalidSeatsError';
  }
}

function toSeatDTO(seat: { _id: string; row: string; number: number; status: SeatDTO['status'] }): SeatDTO {
  return { id: seat._id, row: seat.row, number: seat.number, status: seat.status };
}

export async function getAllSeats(): Promise<SeatDTO[]> {
  const seats = await Seat.find().sort({ row: 1, number: 1 }).lean();
  return seats.map(toSeatDTO);
}

export async function getAvailableSeats(): Promise<SeatDTO[]> {
  const seats = await Seat.find({ status: 'available' }).sort({ row: 1, number: 1 }).lean();
  return seats.map(toSeatDTO);
}

/**
 * Single source of truth for booking a seat or group of seats. Both the frontend-facing
 * route and the third-party partner route call this function directly — neither implements
 * its own booking logic, which is what guarantees identical concurrency behavior regardless
 * of where a request originated.
 *
 * Correctness under concurrency comes entirely from MongoDB: each seat only moves from
 * 'available' to 'reserved' via a conditional findOneAndUpdate, and a multi-seat request runs
 * all of those conditional updates inside a single transaction so the group is all-or-nothing.
 * There is no in-process locking, which is what makes this safe across multiple backend
 * instances sharing the same MongoDB deployment.
 */
export async function reserveSeats(
  userId: string,
  seatIds: string[],
  source: ReservationSource,
): Promise<ReservationResult> {
  const uniqueSeatIds = [...new Set(seatIds)];

  if (!userId.trim()) {
    return { ok: false, reason: 'INVALID_INPUT', message: 'userId is required.' };
  }
  if (uniqueSeatIds.length === 0) {
    return { ok: false, reason: 'INVALID_INPUT', message: 'At least one seatId is required.' };
  }

  const reservationId = uuidv4();
  const session = await mongoose.startSession();
  let reservationDoc: InstanceType<typeof Reservation> | undefined;

  try {
    await session.withTransaction(async () => {
      const existing = await Seat.find({ _id: { $in: uniqueSeatIds } }, { _id: 1 })
        .session(session)
        .lean();
      const existingIds = new Set(existing.map((s) => s._id));
      const invalidSeatIds = uniqueSeatIds.filter((id) => !existingIds.has(id));
      if (invalidSeatIds.length > 0) {
        throw new InvalidSeatsError(invalidSeatIds);
      }

      const conflictingSeats: string[] = [];
      for (const seatId of uniqueSeatIds) {
        const updated = await Seat.findOneAndUpdate(
          { _id: seatId, status: 'available' },
          { $set: { status: 'reserved', reservationId }, $inc: { version: 1 } },
          { returnDocument: 'after', session },
        );
        if (!updated) {
          conflictingSeats.push(seatId);
        }
      }
      if (conflictingSeats.length > 0) {
        throw new SeatsUnavailableError(conflictingSeats);
      }

      const [created] = await Reservation.create(
        [{ reservationId, userId, seats: uniqueSeatIds, source, status: 'confirmed' }],
        { session },
      );
      reservationDoc = created;
    });
  } catch (err) {
    if (err instanceof SeatsUnavailableError) {
      return { ok: false, reason: 'SEATS_UNAVAILABLE', conflictingSeats: err.conflictingSeats };
    }
    if (err instanceof InvalidSeatsError) {
      return { ok: false, reason: 'INVALID_SEATS', invalidSeatIds: err.invalidSeatIds };
    }
    throw err;
  } finally {
    await session.endSession();
  }

  const reservation = reservationDoc!.toObject();
  const dto: ReservationDTO = {
    reservationId: reservation.reservationId,
    userId: reservation.userId,
    seats: reservation.seats,
    source: reservation.source,
    status: 'confirmed',
    createdAt: reservation.createdAt,
  };

  seatEvents.emitSeatsUpdated({
    seats: uniqueSeatIds.map((id) => ({ id, status: 'reserved' as const })),
  });

  return { ok: true, reservation: dto };
}
