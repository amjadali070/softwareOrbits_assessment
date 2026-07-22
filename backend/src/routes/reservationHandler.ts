import type { Request, Response } from 'express';
import { cancelReservation, reserveSeats } from '../services/reservation.service';
import type { ReservationSource } from '../models/Reservation';
import type { ReserveSeatsRequestBody } from '../validation/reservation.schema';

// One handler, parametrized only by source. The frontend and partner routes both mount this —
// there is no separate booking logic per route, only a different `source` tag and (for partner)
// an extra auth middleware in front of it.
export function createReservationHandler(source: ReservationSource) {
  return async (req: Request, res: Response) => {
    const { userId: bodyUserId, seatIds } = req.body as ReserveSeatsRequestBody;
    // req.userId is set by the authenticate middleware on the frontend route (verified JWT
    // claim); the partner route has no such middleware, so it falls back to the body as before.
    const userId = req.userId ?? bodyUserId;
    const idempotencyKey = req.header('idempotency-key') || undefined;

    const result = await reserveSeats(userId, seatIds, source, idempotencyKey);

    if (result.ok) {
      res.status(201).json({ reservation: result.reservation });
      return;
    }

    switch (result.reason) {
      case 'SEATS_UNAVAILABLE':
        res.status(409).json({
          error: {
            code: result.reason,
            message: 'Some of the requested seats are no longer available.',
            conflictingSeats: result.conflictingSeats,
          },
        });
        return;
      case 'INVALID_SEATS':
        res.status(400).json({
          error: {
            code: result.reason,
            message: 'One or more seat IDs do not exist.',
            invalidSeatIds: result.invalidSeatIds,
          },
        });
        return;
      case 'INVALID_INPUT':
        res.status(400).json({
          error: { code: result.reason, message: result.message },
        });
        return;
      default: {
        const _exhaustive: never = result;
        throw new Error(`Unhandled ReservationResult: ${JSON.stringify(_exhaustive)}`);
      }
    }
  };
}

type CancelRequestBody = { userId?: string };

// Mirrors createReservationHandler: one shared handler for both the frontend and partner
// cancellation routes, calling the same cancelReservation() service function.
export function createCancellationHandler() {
  return async (req: Request, res: Response) => {
    const reservationId = req.params.reservationId;
    if (!reservationId || Array.isArray(reservationId)) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'reservationId is required.' } });
      return;
    }
    const bodyUserId = (req.body as CancelRequestBody | undefined)?.userId;
    const userId = req.userId ?? bodyUserId;
    if (!userId) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'userId is required.' } });
      return;
    }

    const result = await cancelReservation(reservationId, userId);

    if (result.ok) {
      res.status(200).json({ reservation: result.reservation });
      return;
    }

    switch (result.reason) {
      case 'NOT_FOUND':
        res.status(404).json({
          error: { code: result.reason, message: 'No reservation found with that ID.' },
        });
        return;
      case 'FORBIDDEN':
        res.status(403).json({
          error: { code: result.reason, message: 'This reservation belongs to a different user.' },
        });
        return;
      case 'NOT_CANCELLABLE':
        res.status(409).json({
          error: {
            code: result.reason,
            message: `Reservation is already ${result.status}, not cancellable.`,
          },
        });
        return;
      default: {
        const _exhaustive: never = result;
        throw new Error(`Unhandled CancellationResult: ${JSON.stringify(_exhaustive)}`);
      }
    }
  };
}
