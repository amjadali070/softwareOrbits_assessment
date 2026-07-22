import type { Request, Response } from 'express';
import { reserveSeats } from '../services/reservation.service';
import type { ReservationSource } from '../models/Reservation';
import type { ReserveSeatsRequestBody } from '../validation/reservation.schema';

// One handler, parametrized only by source. The frontend and partner routes both mount this —
// there is no separate booking logic per route, only a different `source` tag and (for partner)
// an extra auth middleware in front of it.
export function createReservationHandler(source: ReservationSource) {
  return async (req: Request, res: Response) => {
    const { userId, seatIds } = req.body as ReserveSeatsRequestBody;
    const result = await reserveSeats(userId, seatIds, source);

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
