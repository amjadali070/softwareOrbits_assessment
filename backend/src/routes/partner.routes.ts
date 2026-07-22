import { Router } from 'express';
import { partnerAuth } from '../middleware/partnerAuth';
import { validateBody } from '../middleware/validate';
import { reserveSeatsRequestSchema } from '../validation/reservation.schema';
import { createReservationHandler } from './reservationHandler';

const router = Router();

router.post(
  '/v1/reservations',
  partnerAuth,
  validateBody(reserveSeatsRequestSchema),
  createReservationHandler('partner'),
);

export default router;
