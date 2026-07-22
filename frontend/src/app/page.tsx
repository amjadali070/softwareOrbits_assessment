'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SeatGrid } from '@/components/SeatGrid';
import { ReservationPanel } from '@/components/ReservationPanel';
import { ApiError, fetchSeats, reserveSeats } from '@/lib/api';
import { createSocket } from '@/lib/socket';
import { getOrCreateUserId, persistUserId } from '@/lib/userId';
import type { Seat, SeatsSnapshotPayload, SeatsUpdatedPayload } from '@/types/reservation';

export default function Home() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [userId, setUserIdState] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Deliberately deferred to an effect: localStorage doesn't exist during SSR, so reading it
    // during render would mismatch the server-rendered HTML. This runs once, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserIdState(getOrCreateUserId());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSeats()
      .then((data) => {
        if (!cancelled) setSeats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load seats.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSeats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('seats:snapshot', (payload: SeatsSnapshotPayload) => {
      setSeats(payload.seats);
      setIsLoadingSeats(false);
    });

    socket.on('seats:updated', (payload: SeatsUpdatedPayload) => {
      const updates = new Map(payload.seats.map((s) => [s.id, s.status]));
      setSeats((current) =>
        current.map((seat) =>
          updates.has(seat.id) ? { ...seat, status: updates.get(seat.id)! } : seat,
        ),
      );
      // If a seat we had selected just got taken (by us or someone else), drop it from selection.
      setSelectedSeatIds((current) => {
        const next = new Set(current);
        for (const s of payload.seats) {
          if (s.status === 'reserved') next.delete(s.id);
        }
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const toggleSeat = useCallback((seatId: string) => {
    setSelectedSeatIds((current) => {
      const next = new Set(current);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
    setSubmitError(null);
    setSubmitSuccess(null);
  }, []);

  const handleUserIdChange = useCallback((id: string) => {
    setUserIdState(id);
    persistUserId(id);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedSeatIds.size === 0 || !userId.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const reservation = await reserveSeats(userId, [...selectedSeatIds]);
      setSubmitSuccess(`Reserved ${reservation.seats.join(', ')}.`);
      setSelectedSeatIds(new Set());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.conflictingSeats?.length) {
          setSubmitError(
            `Seats ${err.conflictingSeats.join(', ')} were just taken — please reselect.`,
          );
        } else if (err.invalidSeatIds?.length) {
          setSubmitError(`Unknown seat(s): ${err.invalidSeatIds.join(', ')}.`);
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedSeatIds, userId]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Cinema Seat Reservation</h1>
        <p className="text-sm text-gray-500">
          One showing, 50 seats. Updates in real time across all open tabs.
        </p>
      </div>

      {isLoadingSeats && <p className="text-sm text-gray-500">Loading seats…</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {!isLoadingSeats && !loadError && (
        <>
          <SeatGrid
            seats={seats}
            selectedSeatIds={selectedSeatIds}
            onToggleSeat={toggleSeat}
            disabled={isSubmitting}
          />
          <ReservationPanel
            userId={userId}
            onUserIdChange={handleUserIdChange}
            selectedSeatIds={[...selectedSeatIds]}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            errorMessage={submitError}
            successMessage={submitSuccess}
          />
        </>
      )}
    </main>
  );
}
