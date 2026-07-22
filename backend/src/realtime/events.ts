import { EventEmitter } from 'events';
import type { SeatStatus } from '../models/Seat';

export const SEATS_UPDATED_EVENT = 'seats:updated';

export type SeatsUpdatedPayload = {
  seats: { id: string; status: SeatStatus }[];
};

class SeatEventBus extends EventEmitter {
  emitSeatsUpdated(payload: SeatsUpdatedPayload): void {
    this.emit(SEATS_UPDATED_EVENT, payload);
  }
}

// Decouples booking logic from the transport (Socket.IO + Redis, wired up in Phase 4).
// The service only needs to announce "these seats changed" — it doesn't know or care who's listening.
export const seatEvents = new SeatEventBus();
