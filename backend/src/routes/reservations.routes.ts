import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { reserveSeatsRequestSchema } from '../validation/reservation.schema';
import { createCancellationHandler, createReservationHandler } from './reservationHandler';

const router = Router();

router.post(
  '/',
  authenticate,
  validateBody(reserveSeatsRequestSchema),
  createReservationHandler('frontend'),
);

router.delete('/:reservationId', authenticate, createCancellationHandler());

export default router;
