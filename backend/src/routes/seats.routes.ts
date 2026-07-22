import { Router } from 'express';
import { getAllSeats, getAvailableSeats } from '../services/reservation.service';

const router = Router();

router.get('/', async (_req, res) => {
  const seats = await getAllSeats();
  res.json({ seats });
});

router.get('/availability', async (_req, res) => {
  const seats = await getAvailableSeats();
  res.json({ seats });
});

export default router;
