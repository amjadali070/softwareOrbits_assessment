export type SeatStatus = 'available' | 'reserved';

export type Seat = {
  id: string;
  row: string;
  number: number;
  status: SeatStatus;
};

export type ReservationSource = 'frontend' | 'partner';

export type ReservationStatus = 'confirmed' | 'cancelled' | 'expired';

export type Reservation = {
  reservationId: string;
  userId: string;
  seats: string[];
  source: ReservationSource;
  status: ReservationStatus;
  createdAt: string;
};

export type ApiErrorCode =
  | 'SEATS_UNAVAILABLE'
  | 'INVALID_SEATS'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_CANCELLABLE'
  | 'INTERNAL_ERROR';

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode | string;
    message: string;
    conflictingSeats?: string[];
    invalidSeatIds?: string[];
    details?: unknown;
  };
};

export type SeatsSnapshotPayload = {
  seats: Seat[];
};

export type SeatsUpdatedPayload = {
  seats: { id: string; status: SeatStatus }[];
};
