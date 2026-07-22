import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Seat } from '../models/Seat';
import { Reservation, ReservationSource } from '../models/Reservation';
import { seatEvents } from '../realtime/events';
import { env } from '../config/env';
import type {
  CancellationResult,
  ReservationDTO,
  ReservationResult,
  SeatDTO,
} from '../types/reservation.types';

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

class DuplicateIdempotencyKeyError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super('DUPLICATE_IDEMPOTENCY_KEY');
    this.name = 'DuplicateIdempotencyKeyError';
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

function toSeatDTO(seat: {
  _id: string;
  row: string;
  number: number;
  status: SeatDTO['status'];
}): SeatDTO {
  return { id: seat._id, row: seat.row, number: seat.number, status: seat.status };
}

function toReservationDTO(reservation: InstanceType<typeof Reservation>): ReservationDTO {
  const obj = reservation.toObject();
  return {
    reservationId: obj.reservationId,
    userId: obj.userId,
    seats: obj.seats,
    source: obj.source,
    status: obj.status,
    createdAt: obj.createdAt,
  };
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
 *
 * An optional idempotencyKey makes retried requests (e.g. a client that timed out but whose
 * first attempt actually succeeded server-side) safe to resend: a second call with the same key
 * returns the original reservation instead of attempting to book again. The race where two
 * concurrent requests share a key is resolved by a unique sparse index on idempotencyKey — the
 * loser's insert fails, its transaction rolls back (including its seat updates), and it re-reads
 * the winner's reservation instead of erroring.
 */
export async function reserveSeats(
  userId: string,
  seatIds: string[],
  source: ReservationSource,
  idempotencyKey?: string,
): Promise<ReservationResult> {
  const uniqueSeatIds = [...new Set(seatIds)];

  if (!userId.trim()) {
    return { ok: false, reason: 'INVALID_INPUT', message: 'userId is required.' };
  }
  if (uniqueSeatIds.length === 0) {
    return { ok: false, reason: 'INVALID_INPUT', message: 'At least one seatId is required.' };
  }

  if (idempotencyKey) {
    const existing = await Reservation.findOne({ idempotencyKey });
    if (existing) {
      return { ok: true, reservation: toReservationDTO(existing) };
    }
  }

  const reservationId = uuidv4();
  const expiresAt = new Date(Date.now() + env.reservationTtlMs);
  const session = await mongoose.startSession();
  let reservationDoc: InstanceType<typeof Reservation> | undefined;
  let duplicateKey: string | undefined;

  try {
    await session.withTransaction(async () => {
      const existingSeats = await Seat.find({ _id: { $in: uniqueSeatIds } }, { _id: 1 })
        .session(session)
        .lean();
      const existingIds = new Set(existingSeats.map((s) => s._id));
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

      const doc: Record<string, unknown> = {
        reservationId,
        userId,
        seats: uniqueSeatIds,
        source,
        status: 'confirmed',
        expiresAt,
      };
      if (idempotencyKey) doc.idempotencyKey = idempotencyKey;

      try {
        const [created] = await Reservation.create([doc], { session });
        reservationDoc = created;
      } catch (err) {
        if (idempotencyKey && isDuplicateKeyError(err)) {
          throw new DuplicateIdempotencyKeyError(idempotencyKey);
        }
        throw err;
      }
    });
  } catch (err) {
    if (err instanceof SeatsUnavailableError) {
      return { ok: false, reason: 'SEATS_UNAVAILABLE', conflictingSeats: err.conflictingSeats };
    }
    if (err instanceof InvalidSeatsError) {
      return { ok: false, reason: 'INVALID_SEATS', invalidSeatIds: err.invalidSeatIds };
    }
    if (err instanceof DuplicateIdempotencyKeyError) {
      duplicateKey = err.idempotencyKey;
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  if (duplicateKey) {
    const winner = await Reservation.findOne({ idempotencyKey: duplicateKey });
    if (winner) {
      return { ok: true, reservation: toReservationDTO(winner) };
    }
    return {
      ok: false,
      reason: 'INVALID_INPUT',
      message: 'Idempotency key conflict could not be resolved.',
    };
  }

  seatEvents.emitSeatsUpdated({
    seats: uniqueSeatIds.map((id) => ({ id, status: 'reserved' as const })),
  });

  return { ok: true, reservation: toReservationDTO(reservationDoc!) };
}

/**
 * Releases a confirmed reservation's seats back to 'available' and marks it 'cancelled'. Shares
 * the same transactional, no-in-process-locking approach as reserveSeats — the only way a seat's
 * status changes is a guarded update inside a transaction, so this can't race with a concurrent
 * booking or with the expiration sweep (see expiration.service.ts) any differently than two
 * booking attempts race each other.
 */
export async function cancelReservation(
  reservationId: string,
  userId: string,
): Promise<CancellationResult> {
  const session = await mongoose.startSession();
  let result: CancellationResult | undefined;
  let releasedSeatIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findOne({ reservationId }).session(session);
      if (!reservation) {
        result = { ok: false, reason: 'NOT_FOUND' };
        return;
      }
      if (reservation.userId !== userId) {
        result = { ok: false, reason: 'FORBIDDEN' };
        return;
      }
      if (reservation.status !== 'confirmed') {
        result = { ok: false, reason: 'NOT_CANCELLABLE', status: reservation.status };
        return;
      }

      const seatsToRelease = await Seat.find(
        { reservationId: reservation.reservationId, status: 'reserved' },
        { _id: 1 },
      ).session(session);
      releasedSeatIds = seatsToRelease.map((s) => s._id);

      if (releasedSeatIds.length > 0) {
        await Seat.updateMany(
          { reservationId: reservation.reservationId, status: 'reserved' },
          { $set: { status: 'available', reservationId: null }, $inc: { version: 1 } },
          { session },
        );
      }

      reservation.status = 'cancelled';
      await reservation.save({ session });
      result = { ok: true, reservation: toReservationDTO(reservation) };
    });
  } finally {
    await session.endSession();
  }

  if (result?.ok && releasedSeatIds.length > 0) {
    seatEvents.emitSeatsUpdated({
      seats: releasedSeatIds.map((id) => ({ id, status: 'available' as const })),
    });
  }

  return result!;
}
