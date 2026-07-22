import type { ApiErrorBody, Reservation, Seat } from '@/types/reservation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly conflictingSeats?: string[],
    public readonly invalidSeatIds?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const err = body as ApiErrorBody;
    throw new ApiError(
      res.status,
      err.error?.code ?? 'UNKNOWN_ERROR',
      err.error?.message ?? 'Something went wrong.',
      err.error?.conflictingSeats,
      err.error?.invalidSeatIds,
    );
  }
  return body as T;
}

export async function fetchSeats(): Promise<Seat[]> {
  const res = await fetch(`${API_URL}/api/seats`);
  const data = await parseJsonOrThrow<{ seats: Seat[] }>(res);
  return data.seats;
}

export async function fetchAvailableSeats(): Promise<Seat[]> {
  const res = await fetch(`${API_URL}/api/seats/availability`);
  const data = await parseJsonOrThrow<{ seats: Seat[] }>(res);
  return data.seats;
}

export async function login(userId: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await parseJsonOrThrow<{ token: string }>(res);
  return data.token;
}

export async function reserveSeats(
  token: string,
  userId: string,
  seatIds: string[],
  idempotencyKey: string,
): Promise<Reservation> {
  const res = await fetch(`${API_URL}/api/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ userId, seatIds }),
  });
  const data = await parseJsonOrThrow<{ reservation: Reservation }>(res);
  return data.reservation;
}

export async function cancelReservation(
  token: string,
  reservationId: string,
): Promise<Reservation> {
  const res = await fetch(`${API_URL}/api/reservations/${encodeURIComponent(reservationId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJsonOrThrow<{ reservation: Reservation }>(res);
  return data.reservation;
}

export type SimulationResultDto = {
  ok: boolean;
  totalAttempts: number;
  successful: number;
  successfulFrontend: number;
  successfulPartner: number;
  conflicts: number;
  errors: number;
  elapsedMs: number;
  doubleBookedCount: number;
};

export async function runSimulationApi(userCount = 100): Promise<SimulationResultDto> {
  const res = await fetch(`${API_URL}/api/simulation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCount }),
  });
  const data = await parseJsonOrThrow<{ simulation: SimulationResultDto }>(res);
  return data.simulation;
}
