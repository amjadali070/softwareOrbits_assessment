import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from './app';
import { Seat } from './models/Seat';
import { Reservation } from './models/Reservation';
import { env } from './config/env';
import { signToken } from './services/auth.service';

// Exercises the real HTTP layer (routes, validation middleware, partner auth, JWT auth, error
// handler) — reservation.service.test.ts already proves the booking logic itself is correct in
// isolation; this file proves nothing gets lost or broken between an HTTP request and that logic.
// Separate DB from the service-level tests so the two files can run in parallel safely.
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/cinema_test_http?replicaSet=rs0';
const TEST_SEAT_IDS = ['X1', 'X2', 'X3'];

const app = createApp();

function bearerFor(userId: string): string {
  return `Bearer ${signToken(userId)}`;
}

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

describe('POST /api/auth/login', () => {
  it('issues a bearer token for a self-declared userId', async () => {
    const res = await request(app).post('/api/auth/login').send({ userId: 'alice' });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('alice');
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 400 for a missing userId', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});

describe('POST /api/reservations (frontend, requires auth)', () => {
  it('returns 401 without a bearer token', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({ userId: 'alice', seatIds: ['X1'] });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a garbage token', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ userId: 'alice', seatIds: ['X1'] });
    expect(res.status).toBe(401);
  });

  it('books available seats and returns 201', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1', 'X2'] });
    expect(res.status).toBe(201);
    expect([...res.body.reservation.seats].sort()).toEqual(['X1', 'X2']);
    expect(res.body.reservation.source).toBe('frontend');
    expect(res.body.reservation.userId).toBe('alice');
  });

  it('trusts the token over the body for userId, not the other way around', async () => {
    // Body claims to be "eve" but the token says "alice" — the reservation must be recorded
    // under the authenticated identity, not whatever the body claims.
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'eve', seatIds: ['X1'] });
    expect(res.status).toBe(201);
    expect(res.body.reservation.userId).toBe('alice');
  });

  it('returns 409 with conflictingSeats when a seat is already taken', async () => {
    await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1'] });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('bob'))
      .send({ userId: 'bob', seatIds: ['X1', 'X2'] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEATS_UNAVAILABLE');
    expect(res.body.error.conflictingSeats).toEqual(['X1']);
  });

  it('returns 400 for an unknown seat id', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['DOES_NOT_EXIST'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SEATS');
    expect(res.body.error.invalidSeatIds).toEqual(['DOES_NOT_EXIST']);
  });

  it('returns 400 for a missing userId in the body', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ seatIds: ['X1'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for an empty seatIds array', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when seatIds is not an array', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: 'X1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});

describe('Idempotency-Key on POST /api/reservations', () => {
  it('replays the original reservation instead of double-booking on retry', async () => {
    const key = 'retry-key-1';
    const first = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .set('Idempotency-Key', key)
      .send({ userId: 'alice', seatIds: ['X1'] });
    expect(first.status).toBe(201);

    const retry = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .set('Idempotency-Key', key)
      .send({ userId: 'alice', seatIds: ['X1'] });
    expect(retry.status).toBe(201);
    expect(retry.body.reservation.reservationId).toBe(first.body.reservation.reservationId);

    const reservations = await Reservation.find({ seats: 'X1' });
    expect(reservations).toHaveLength(1);
  });

  it('never creates more than one reservation when concurrent requests share the same key', async () => {
    // Concurrent requests race for the seat itself before any of them commits its Reservation
    // doc, so a loser can legitimately see SEATS_UNAVAILABLE rather than the idempotent replay
    // (that replay path is for a *sequential* retry — see the test above). What idempotency keys
    // guarantee here is the thing that actually matters: never more than one reservation, and
    // every success points at the same one — not that every concurrent racer succeeds.
    const key = 'retry-key-concurrent';
    const attempts = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/reservations')
        .set('Authorization', bearerFor('alice'))
        .set('Idempotency-Key', key)
        .send({ userId: 'alice', seatIds: ['X2'] }),
    );
    const responses = await Promise.all(attempts);

    const successes = responses.filter((r) => r.status === 201);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    const reservationIds = new Set(successes.map((r) => r.body.reservation.reservationId));
    expect(reservationIds.size).toBe(1); // never more than one distinct reservation

    const reservations = await Reservation.find({ seats: 'X2' });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.idempotencyKey).toBe(key);
  });
});

describe('DELETE /api/reservations/:reservationId (cancellation)', () => {
  it('releases the seat and marks the reservation cancelled', async () => {
    const booked = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1'] });
    const reservationId = booked.body.reservation.reservationId;

    const res = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set('Authorization', bearerFor('alice'));
    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('cancelled');

    const seat = await Seat.findById('X1');
    expect(seat?.status).toBe('available');
    expect(seat?.reservationId).toBeNull();
  });

  it('returns 403 when a different user tries to cancel', async () => {
    const booked = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1'] });
    const reservationId = booked.body.reservation.reservationId;

    const res = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set('Authorization', bearerFor('mallory'));
    expect(res.status).toBe(403);

    const seat = await Seat.findById('X1');
    expect(seat?.status).toBe('reserved'); // untouched
  });

  it('returns 404 for an unknown reservation id', async () => {
    const res = await request(app)
      .delete('/api/reservations/does-not-exist')
      .set('Authorization', bearerFor('alice'));
    expect(res.status).toBe(404);
  });

  it('returns 409 when cancelling an already-cancelled reservation', async () => {
    const booked = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1'] });
    const reservationId = booked.body.reservation.reservationId;

    await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set('Authorization', bearerFor('alice'));
    const res = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set('Authorization', bearerFor('alice'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_CANCELLABLE');
  });

  it('a cancelled seat becomes bookable again', async () => {
    const booked = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1'] });
    await request(app)
      .delete(`/api/reservations/${booked.body.reservation.reservationId}`)
      .set('Authorization', bearerFor('alice'));

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('bob'))
      .send({ userId: 'bob', seatIds: ['X1'] });
    expect(res.status).toBe(201);
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

describe('DELETE /api/partner/v1/reservations/:reservationId', () => {
  it('shares the same cancellation logic as the frontend route', async () => {
    const booked = await request(app)
      .post('/api/partner/v1/reservations')
      .set('x-api-key', env.partnerApiKey)
      .send({ userId: 'partner-co', seatIds: ['X1'] });

    const res = await request(app)
      .delete(`/api/partner/v1/reservations/${booked.body.reservation.reservationId}`)
      .set('x-api-key', env.partnerApiKey)
      .send({ userId: 'partner-co' });
    expect(res.status).toBe(200);

    const seat = await Seat.findById('X1');
    expect(seat?.status).toBe('available');
  });

  it('requires the partner API key', async () => {
    const booked = await request(app)
      .post('/api/partner/v1/reservations')
      .set('x-api-key', env.partnerApiKey)
      .send({ userId: 'partner-co', seatIds: ['X1'] });

    const res = await request(app)
      .delete(`/api/partner/v1/reservations/${booked.body.reservation.reservationId}`)
      .send({ userId: 'partner-co' });
    expect(res.status).toBe(401);
  });
});

describe('cross-path conflict: frontend and partner share booking state', () => {
  it('a seat booked via the frontend route is rejected via the partner route', async () => {
    await request(app)
      .post('/api/reservations')
      .set('Authorization', bearerFor('alice'))
      .send({ userId: 'alice', seatIds: ['X1'] });
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
      const userId = `user-${i}`;
      const req = request(app).post(
        isPartner ? '/api/partner/v1/reservations' : '/api/reservations',
      );
      if (isPartner) {
        req.set('x-api-key', env.partnerApiKey);
      } else {
        req.set('Authorization', bearerFor(userId));
      }
      return req.send({ userId, seatIds: [seatId] });
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
