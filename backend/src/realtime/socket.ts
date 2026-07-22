import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { env } from '../config/env';
import { getAllSeats } from '../services/reservation.service';
import {
  seatEvents,
  SEATS_UPDATED_EVENT,
  SEATS_SNAPSHOT_EVENT,
  type SeatsUpdatedPayload,
} from './events';

export type Realtime = {
  io: SocketIOServer;
  close: () => Promise<void>;
};

/**
 * Every backend instance runs its own Socket.IO server, but they all attach to the same Redis
 * pub/sub channels via the redis-adapter. When any instance's booking service emits
 * SEATS_UPDATED_EVENT locally (see reservation.service.ts), that instance's io.emit() call is
 * fanned out through Redis to every other instance's connected sockets — so a client connected
 * to instance B still sees a reservation committed on instance A, with no direct connection
 * between the instances themselves.
 */
export async function setupRealtime(httpServer: HttpServer): Promise<Realtime> {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigin },
  });

  const pubClient = new Redis(env.redisUrl);
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => console.error('Redis pub client error:', err));
  subClient.on('error', (err) => console.error('Redis sub client error:', err));

  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket) => {
    getAllSeats()
      .then((seats) => {
        socket.emit(SEATS_SNAPSHOT_EVENT, { seats });
      })
      .catch((err) => console.error('Failed to send seats:snapshot:', err));
  });

  const onSeatsUpdated = (payload: SeatsUpdatedPayload) => {
    io.emit(SEATS_UPDATED_EVENT, payload);
  };
  seatEvents.on(SEATS_UPDATED_EVENT, onSeatsUpdated);

  const close = async () => {
    seatEvents.off(SEATS_UPDATED_EVENT, onSeatsUpdated);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await Promise.all([pubClient.quit(), subClient.quit()]);
  };

  return { io, close };
}
