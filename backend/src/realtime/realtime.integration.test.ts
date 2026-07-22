import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../app';
import { setupRealtime, type Realtime } from './socket';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { signToken } from '../services/auth.service';

// Regression guard for the real-time layer itself: proves a client actually receives
// seats:snapshot on connect and seats:updated after a real reservation goes through the full
// HTTP stack — not just that reserveSeats() calls seatEvents.emit() (already covered elsewhere).
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/cinema_test_realtime?replicaSet=rs0';
const SEAT_ID = 'RT1';

let httpServer: HttpServer;
let realtime: Realtime;
let baseUrl: string;
let clientSocket: Socket;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);

  const app = createApp();
  httpServer = createServer(app);
  realtime = await setupRealtime(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await realtime.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Seat.deleteMany({});
  await Reservation.deleteMany({});
  await Seat.create({
    _id: SEAT_ID,
    row: 'RT',
    number: 1,
    status: 'available',
    version: 0,
    reservationId: null,
  });

  clientSocket = ioClient(baseUrl, { transports: ['websocket'] });
  await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
});

afterEach(() => {
  clientSocket.disconnect();
});

describe('real-time layer', () => {
  it('sends a seats:snapshot with the current seat state on connect', async () => {
    const snapshot = await new Promise<{ seats: { id: string; status: string }[] }>((resolve) => {
      clientSocket.on('seats:snapshot', resolve);
    });
    expect(snapshot.seats.some((s) => s.id === SEAT_ID && s.status === 'available')).toBe(true);
  });

  it('broadcasts seats:updated to connected clients after a successful reservation', async () => {
    const updatedPromise = new Promise<{ seats: { id: string; status: string }[] }>((resolve) => {
      clientSocket.on('seats:updated', resolve);
    });

    const res = await fetch(`${baseUrl}/api/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signToken('rt-user')}`,
      },
      body: JSON.stringify({ userId: 'rt-user', seatIds: [SEAT_ID] }),
    });
    expect(res.status).toBe(201);

    const updated = await updatedPromise;
    expect(updated.seats).toEqual([{ id: SEAT_ID, status: 'reserved' }]);
  });
});
