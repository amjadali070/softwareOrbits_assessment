import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import seatsRouter from './routes/seats.routes';
import reservationsRouter from './routes/reservations.routes';
import partnerRouter from './routes/partner.routes';
import authRouter from './routes/auth.routes';
import simulationRouter from './routes/simulation.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/seats', seatsRouter);
  app.use('/api/reservations', reservationsRouter);
  app.use('/api/partner', partnerRouter);
  app.use('/api/simulation', simulationRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  app.use(errorHandler);

  return app;
}
