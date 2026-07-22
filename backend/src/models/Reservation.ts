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
    // Left entirely absent (not null) when not supplied — a sparse unique index only excludes
    // documents where the field is missing, not documents where it's explicitly null, so setting
    // it to null on every non-idempotent reservation would collide on the first two of them.
    idempotencyKey: { type: String },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

reservationSchema.index({ status: 1, expiresAt: 1 });
reservationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export type ReservationDocument = InferSchemaType<typeof reservationSchema>;

export const Reservation = model<ReservationDocument>('Reservation', reservationSchema);
