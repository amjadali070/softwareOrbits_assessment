import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { setupRealtime } from './realtime/socket';

async function main() {
  await connectDB();

  const app = createApp();
  const httpServer = createServer(app);
  await setupRealtime(httpServer);

  httpServer.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
