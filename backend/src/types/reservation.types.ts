import type { SeatStatus } from '../models/Seat';
import type { ReservationSource, ReservationStatus } from '../models/Reservation';

export type SeatDTO = {
  id: string;
  row: string;
  number: number;
  status: SeatStatus;
};

export type ReservationDTO = {
  reservationId: string;
  userId: string;
  seats: string[];
  source: ReservationSource;
  status: ReservationStatus;
  createdAt: Date;
};

export type ReservationResult =
  | { ok: true; reservation: ReservationDTO }
  | { ok: false; reason: 'INVALID_INPUT'; message: string }
  | { ok: false; reason: 'INVALID_SEATS'; invalidSeatIds: string[] }
  | { ok: false; reason: 'SEATS_UNAVAILABLE'; conflictingSeats: string[] };

export type CancellationResult =
  | { ok: true; reservation: ReservationDTO }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'FORBIDDEN' }
  | { ok: false; reason: 'NOT_CANCELLABLE'; status: ReservationStatus };
