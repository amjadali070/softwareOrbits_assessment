import { Schema, model, InferSchemaType } from 'mongoose';

export const RESERVATION_SOURCES = ['frontend', 'partner'] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const RESERVATION_STATUSES = ['confirmed', 'cancelled', 'expired'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const reservationSchema = new Schema(
  {
    reservationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    seats: { type: [String], required: true },
    source: { type: String, enum: RESERVATION_SOURCES, required: true },
    status: {
      type: String,
      enum: RESERVATION_STATUSES,
      required: true,
      default: 'confirmed',
    },
    expiresAt: { type: Date, default: null },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

reservationSchema.index({ status: 1, expiresAt: 1 });

export type ReservationDocument = InferSchemaType<typeof reservationSchema>;

export const Reservation = model('Reservation', reservationSchema);
