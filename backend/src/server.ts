import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
const httpServer = createServer(app);

httpServer.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
