import { Router } from 'express';
import { partnerAuth } from '../middleware/partnerAuth';
import { validateBody } from '../middleware/validate';
import { reserveSeatsRequestSchema } from '../validation/reservation.schema';
import { createCancellationHandler, createReservationHandler } from './reservationHandler';

const router = Router();

router.post(
  '/v1/reservations',
  partnerAuth,
  validateBody(reserveSeatsRequestSchema),
  createReservationHandler('partner'),
);

router.delete('/v1/reservations/:reservationId', partnerAuth, createCancellationHandler());

export default router;
