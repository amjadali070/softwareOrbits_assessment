import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from './app';
import { Seat } from './models/Seat';
import { Reservation } from './models/Reservation';
import { env } from './config/env';

// Exercises the real HTTP layer (routes, validation middleware, partner auth, error handler) —
// reservation.service.test.ts already proves the booking logic itself is correct in isolation;
// this file proves nothing gets lost or broken between an HTTP request and that logic.
// Separate DB from the service-level tests so the two files can run in parallel safely.
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/cinema_test_http?replicaSet=rs0';
const TEST_SEAT_IDS = ['X1', 'X2', 'X3'];

const app = createApp();

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Seat.deleteMany({});
  await Reservation.deleteMany({});
  await Seat.insertMany(
    TEST_SEAT_IDS.map((id, i) => ({
      _id: id,
      row: 'X',
      number: i + 1,
      status: 'available' as const,
      version: 0,
      reservationId: null,
    })),
  );
});

describe('GET /api/seats', () => {
  it('returns all seeded seats', async () => {
    const res = await request(app).get('/api/seats');
    expect(res.status).toBe(200);
    expect(res.body.seats).toHaveLength(TEST_SEAT_IDS.length);
  });
});

describe('GET /api/seats/availability', () => {
  it('excludes seats that are already reserved', async () => {
    await Seat.updateOne({ _id: 'X1' }, { $set: { status: 'reserved' } });
    const res = await request(app).get('/api/seats/availability');
    expect(res.status).toBe(200);
    expect(res.body.seats.map((s: { id: string }) => s.id)).not.toContain('X1');
    expect(res.body.seats).toHaveLength(TEST_SEAT_IDS.length - 1);
  });
});

describe('POST /api/reservations (frontend)', () => {
  it('books available seats and returns 201', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({ userId: 'alice', seatIds: ['X1', 'X2'] });
    expect(res.status).toBe(201);
    expect([...res.body.reservation.seats].sort()).toEqual(['X1', 'X2']);
    expect(res.body.reservation.source).toBe('frontend');
  });

  it('returns 409 with conflictingSeats when a seat is already taken', async () => {
    await request(app).post('/api/reservations').send({ userId: 'alice', seatIds: ['X1'] });
    const res = await request(app)
      .post('/api/reservations')
      .send({ userId: 'bob', seatIds: ['X1', 'X2'] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEATS_UNAVAILABLE');
    expect(res.body.error.conflictingSeats).toEqual(['X1']);
  });

  it('returns 400 for an unknown seat id', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({ userId: 'alice', seatIds: ['DOES_NOT_EXIST'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SEATS');
    expect(res.body.error.invalidSeatIds).toEqual(['DOES_NOT_EXIST']);
  });

  it('returns 400 for a missing userId', async () => {
    const res = await request(app).post('/api/reservations').send({ seatIds: ['X1'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for an empty seatIds array', async () => {
    const res = await request(app).post('/api/reservations').send({ userId: 'alice', seatIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when seatIds is not an array', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({ userId: 'alice', seatIds: 'X1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/partner/v1/reservations (partner)', () => {
  it('returns 401 without an API key', async () => {
    const res = await request(app)
      .post('/api/partner/v1/reservations')
      .send({ userId: 'partner-co', seatIds: ['X1'] });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with the wrong API key', async () => {
    const res = await request(app)
      .post('/api/partner/v1/reservations')
      .set('x-api-key', 'wrong-key')
      .send({ userId: 'partner-co', seatIds: ['X1'] });
    expect(res.status).toBe(401);
  });

  it('books seats with the correct API key and tags the source as partner', async () => {
    const res = await request(app)
      .post('/api/partner/v1/reservations')
      .set('x-api-key', env.partnerApiKey)
      .send({ userId: 'partner-co', seatIds: ['X1'] });
    expect(res.status).toBe(201);
    expect(res.body.reservation.source).toBe('partner');
  });
});

describe('cross-path conflict: frontend and partner share booking state', () => {
  it('a seat booked via the frontend route is rejected via the partner route', async () => {
    await request(app).post('/api/reservations').send({ userId: 'alice', seatIds: ['X1'] });
    const res = await request(app)
      .post('/api/partner/v1/reservations')
      .set('x-api-key', env.partnerApiKey)
      .send({ userId: 'partner-co', seatIds: ['X1'] });
    expect(res.status).toBe(409);
  });
});

describe('unknown routes', () => {
  it('returns a structured 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('concurrency across both HTTP routes', () => {
  it('never double-books when frontend and partner requests race the same 3 seats', async () => {
    const attempts = Array.from({ length: 20 }, (_, i) => {
      const seatId = TEST_SEAT_IDS[i % TEST_SEAT_IDS.length] as string;
      const isPartner = i % 2 === 1;
      const req = request(app).post(isPartner ? '/api/partner/v1/reservations' : '/api/reservations');
      if (isPartner) req.set('x-api-key', env.partnerApiKey);
      return req.send({ userId: `user-${i}`, seatIds: [seatId] });
    });

    const responses = await Promise.all(attempts);
    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(successes.length).toBe(TEST_SEAT_IDS.length); // exactly one winner per seat
    expect(conflicts.length).toBe(20 - TEST_SEAT_IDS.length);

    const seats = await Seat.find({ _id: { $in: TEST_SEAT_IDS } });
    expect(seats.every((s) => s.status === 'reserved')).toBe(true);
    expect(new Set(seats.map((s) => s.reservationId)).size).toBe(TEST_SEAT_IDS.length);

    const reservations = await Reservation.find({ seats: { $in: TEST_SEAT_IDS } });
    expect(reservations.length).toBe(TEST_SEAT_IDS.length);
  });
});
