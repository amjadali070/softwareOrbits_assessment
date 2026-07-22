import { Router } from 'express';
import { runSimulation } from '../services/simulation.service';

const router = Router();

router.post('/run', async (req, res, next) => {
  try {
    const userCount = typeof req.body?.userCount === 'number' ? req.body.userCount : 100;
    const result = await runSimulation(userCount);
    res.json({ simulation: result });
  } catch (err) {
    next(err);
  }
});

export default router;
