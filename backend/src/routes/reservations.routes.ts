import { Router } from 'express';
import { validateBody } from '../middleware/validate';
import { reserveSeatsRequestSchema } from '../validation/reservation.schema';
import { createReservationHandler } from './reservationHandler';

const router = Router();

router.post('/', validateBody(reserveSeatsRequestSchema), createReservationHandler('frontend'));

export default router;
