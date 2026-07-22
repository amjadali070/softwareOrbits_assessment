import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { reserveSeats } from './reservation.service';
import { sweepExpiredReservations } from './expiration.service';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/cinema_test_expiration?replicaSet=rs0';
const TEST_SEAT_IDS = ['E1', 'E2'];

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
      row: 'E',
      number: i + 1,
      status: 'available' as const,
      version: 0,
      reservationId: null,
    })),
  );
});

describe('sweepExpiredReservations', () => {
  it('releases seats and marks the reservation expired once past expiresAt', async () => {
    const result = await reserveSeats('alice', ['E1'], 'frontend');
    if (!result.ok) throw new Error('setup reservation failed');

    await Reservation.updateOne(
      { reservationId: result.reservation.reservationId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const released = await sweepExpiredReservations();
    expect(released).toBe(1);

    const seat = await Seat.findById('E1');
    expect(seat?.status).toBe('available');
    expect(seat?.reservationId).toBeNull();

    const reservation = await Reservation.findOne({
      reservationId: result.reservation.reservationId,
    });
    expect(reservation?.status).toBe('expired');
  });

  it('leaves reservations that have not expired yet untouched', async () => {
    const result = await reserveSeats('alice', ['E2'], 'frontend');
    if (!result.ok) throw new Error('setup reservation failed');

    const released = await sweepExpiredReservations();
    expect(released).toBe(0);

    const seat = await Seat.findById('E2');
    expect(seat?.status).toBe('reserved');
  });

  it('does not touch a reservation that was already cancelled before it expired', async () => {
    const result = await reserveSeats('alice', ['E1'], 'frontend');
    if (!result.ok) throw new Error('setup reservation failed');

    await Reservation.updateOne(
      { reservationId: result.reservation.reservationId },
      { $set: { status: 'cancelled', expiresAt: new Date(Date.now() - 1000) } },
    );
    await Seat.updateOne({ _id: 'E1' }, { $set: { status: 'available', reservationId: null } });

    const released = await sweepExpiredReservations();
    expect(released).toBe(0);

    const reservation = await Reservation.findOne({
      reservationId: result.reservation.reservationId,
    });
    expect(reservation?.status).toBe('cancelled'); // sweep must not overwrite it to 'expired'
  });
});
