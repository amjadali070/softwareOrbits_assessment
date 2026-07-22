import { Schema, model, InferSchemaType } from 'mongoose';

export const SEAT_STATUSES = ['available', 'reserved'] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

const seatSchema = new Schema(
  {
    _id: { type: String, required: true }, // e.g. "A1"
    row: { type: String, required: true },
    number: { type: Number, required: true },
    status: {
      type: String,
      enum: SEAT_STATUSES,
      required: true,
      default: 'available',
    },
    version: { type: Number, required: true, default: 0 },
    reservationId: { type: String, default: null },
  },
  { versionKey: false, timestamps: false },
);

seatSchema.index({ status: 1 });

export type SeatDocument = InferSchemaType<typeof seatSchema>;

export const Seat = model('Seat', seatSchema);
