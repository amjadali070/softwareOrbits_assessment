import { connectDB, disconnectDB } from '../config/db';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';

const ROWS = ['A', 'B', 'C', 'D', 'E'];
const SEATS_PER_ROW = 10;

async function seed() {
  await connectDB();

  await Seat.deleteMany({});
  await Reservation.deleteMany({});

  const seats = ROWS.flatMap((row) =>
    Array.from({ length: SEATS_PER_ROW }, (_, i) => {
      const number = i + 1;
      return {
        _id: `${row}${number}`,
        row,
        number,
        status: 'available' as const,
        version: 0,
        reservationId: null,
      };
    }),
  );

  await Seat.insertMany(seats);

  console.log(`Seeded ${seats.length} seats (rows ${ROWS.join(', ')} x ${SEATS_PER_ROW}).`);

  await disconnectDB();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
