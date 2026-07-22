import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import { setupRealtime } from './realtime/socket';
import { startExpirationSweep } from './services/expiration.service';

async function main() {
  await connectDB();

  const app = createApp();
  const httpServer = createServer(app);
  const realtime = await setupRealtime(httpServer);
  const stopExpirationSweep = startExpirationSweep(env.expirationSweepIntervalMs);

  httpServer.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    stopExpirationSweep();
    await realtime.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
