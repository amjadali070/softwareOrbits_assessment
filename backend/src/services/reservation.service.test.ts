import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { getAllSeats, getAvailableSeats, reserveSeats } from './reservation.service';

// Transactions require a real replica set, so these tests run against the local Mongo
// deployment (same one dev/seed use) but in a dedicated database, isolated from dev data.
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/cinema_test?replicaSet=rs0';
const TEST_SEAT_IDS = ['Z1', 'Z2', 'Z3'];

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
      row: 'Z',
      number: i + 1,
      status: 'available' as const,
      version: 0,
      reservationId: null,
    })),
  );
});

describe('reservation.service', () => {
  it('reserves available seats and returns a reservation DTO', async () => {
    const result = await reserveSeats('user-1', ['Z1', 'Z2'], 'frontend');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.reservation.seats].sort()).toEqual(['Z1', 'Z2']);
      expect(result.reservation.userId).toBe('user-1');
      expect(result.reservation.source).toBe('frontend');
      expect(result.reservation.reservationId).toBeTruthy();
      expect(result.reservation.createdAt).toBeInstanceOf(Date);
    }

    const seats = await Seat.find({ _id: { $in: ['Z1', 'Z2'] } });
    expect(seats.every((s) => s.status === 'reserved')).toBe(true);
  });

  it('rejects when a seat is already taken and books nothing else (all-or-nothing)', async () => {
    await reserveSeats('user-1', ['Z1'], 'frontend');

    const result = await reserveSeats('user-2', ['Z1', 'Z2'], 'frontend');

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'SEATS_UNAVAILABLE') {
      expect(result.conflictingSeats).toEqual(['Z1']);
    }

    const seatZ2 = await Seat.findById('Z2');
    expect(seatZ2?.status).toBe('available'); // must not be booked despite Z1 conflicting
  });

  it('reports unknown seat ids distinctly from availability conflicts', async () => {
    const result = await reserveSeats('user-1', ['Z1', 'DOES_NOT_EXIST'], 'frontend');

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'INVALID_SEATS') {
      expect(result.invalidSeatIds).toEqual(['DOES_NOT_EXIST']);
    }

    const seatZ1 = await Seat.findById('Z1');
    expect(seatZ1?.status).toBe('available'); // untouched, whole request rejected
  });

  it('rejects empty seat selections and blank user ids', async () => {
    const noSeats = await reserveSeats('user-1', [], 'frontend');
    expect(noSeats).toEqual({ ok: false, reason: 'INVALID_INPUT', message: expect.any(String) });

    const noUser = await reserveSeats('  ', ['Z1'], 'frontend');
    expect(noUser).toEqual({ ok: false, reason: 'INVALID_INPUT', message: expect.any(String) });
  });

  it('never double-books when 20 concurrent requests race the same 3 seats', async () => {
    const attempts = Array.from({ length: 20 }, (_, i) =>
      reserveSeats(`user-${i}`, [TEST_SEAT_IDS[i % TEST_SEAT_IDS.length] as string], 'frontend'),
    );

    const results = await Promise.all(attempts);

    const successes = results.filter((r) => r.ok);
    const conflicts = results.filter((r) => !r.ok && r.reason === 'SEATS_UNAVAILABLE');

    expect(successes.length).toBe(TEST_SEAT_IDS.length); // exactly one winner per seat
    expect(conflicts.length).toBe(20 - TEST_SEAT_IDS.length);

    const seats = await Seat.find({ _id: { $in: TEST_SEAT_IDS } });
    expect(seats.every((s) => s.status === 'reserved')).toBe(true);
    // every seat's reservationId is distinct -> no seat was double-assigned across reservations
    expect(new Set(seats.map((s) => s.reservationId)).size).toBe(TEST_SEAT_IDS.length);

    const reservations = await Reservation.find({ seats: { $in: TEST_SEAT_IDS } });
    expect(reservations.length).toBe(TEST_SEAT_IDS.length);

    const availableCount = seats.filter((s) => s.status === 'available').length;
    const reservedCount = seats.filter((s) => s.status === 'reserved').length;
    expect(availableCount + reservedCount).toBe(TEST_SEAT_IDS.length);
  });

  it('getAllSeats/getAvailableSeats reflect current state', async () => {
    await reserveSeats('user-1', ['Z1'], 'partner');

    const all = await getAllSeats();
    const available = await getAvailableSeats();

    expect(all.length).toBe(TEST_SEAT_IDS.length);
    expect(available.length).toBe(TEST_SEAT_IDS.length - 1);
    expect(available.find((s) => s.id === 'Z1')).toBeUndefined();
  });
});
