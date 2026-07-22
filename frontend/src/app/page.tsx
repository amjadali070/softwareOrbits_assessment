'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SeatGrid } from '@/components/SeatGrid';
import { ReservationPanel } from '@/components/ReservationPanel';
import { ApiError, cancelReservation, fetchSeats, login, reserveSeats } from '@/lib/api';
import { createSocket } from '@/lib/socket';
import { getOrCreateUserId, persistUserId } from '@/lib/userId';
import type { Seat, SeatsSnapshotPayload, SeatsUpdatedPayload } from '@/types/reservation';

type LastReservation = {
  reservationId: string;
  seats: string[];
};

export default function Home() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [userId, setUserIdState] = useState('');
  const [token, setToken] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [lastReservation, setLastReservation] = useState<LastReservation | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Deliberately deferred to an effect: localStorage doesn't exist during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserIdState(getOrCreateUserId());
  }, []);

  // Debounced JWT login request on userId change.
  useEffect(() => {
    if (!userId.trim()) return;
    const handle = setTimeout(() => {
      login(userId)
        .then((t) => setToken(t))
        .catch(() => setToken(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [userId]);

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

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

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

      // Drop seat from selection if taken
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
    if (selectedSeatIds.size === 0 || !userId.trim() || !token) return;

    const optimisticSeatIds = [...selectedSeatIds];
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    // Optimistic UI: reflect booking immediately
    setSeats((current) =>
      current.map((s) =>
        optimisticSeatIds.includes(s.id) ? { ...s, status: 'reserved' as const } : s,
      ),
    );
    setSelectedSeatIds(new Set());

    const idempotencyKey = crypto.randomUUID();

    try {
      const reservation = await reserveSeats(token, userId, optimisticSeatIds, idempotencyKey);
      setSubmitSuccess(`Reserved ${reservation.seats.join(', ')}.`);
      setLastReservation({ reservationId: reservation.reservationId, seats: reservation.seats });
    } catch (err) {
      const conflicting = err instanceof ApiError ? (err.conflictingSeats ?? []) : [];
      setSeats((current) =>
        current.map((s) =>
          optimisticSeatIds.includes(s.id) && !conflicting.includes(s.id)
            ? { ...s, status: 'available' as const }
            : s,
        ),
      );
      if (err instanceof ApiError) {
        if (conflicting.length > 0) {
          setSubmitError(`Seats ${conflicting.join(', ')} were just taken — please reselect.`);
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
  }, [selectedSeatIds, userId, token]);

  const handleCancelLastReservation = useCallback(async () => {
    if (!lastReservation || !token) return;
    setIsCancelling(true);
    setSubmitError(null);
    try {
      await cancelReservation(token, lastReservation.reservationId);
      setSubmitSuccess('Reservation cancelled — seats are available again.');
      setLastReservation(null);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to cancel reservation.');
    } finally {
      setIsCancelling(false);
    }
  }, [lastReservation, token]);

  return (
    <div className="min-h-screen bg-[#060810] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Header Navbar - Aligned perfectly with main grid container */}
      <header className="border-b border-slate-800/80 bg-[#060810]/90 backdrop-blur-xl py-4 shadow-xl">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">
              Real-Time Cinema Seat Reservation
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              One showing, 50 seats. Live real-time updates via Socket.IO across all open tabs.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-800 px-3 py-1.5 text-xs font-medium">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 beacon-pulse-active' : 'bg-rose-500 animate-pulse'}`} />
            <span className="text-slate-300">
              {isConnected ? 'Socket Live' : 'Reconnecting...'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container - Identical horizontal padding and max width as Header */}
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 flex flex-col gap-6">
        {isLoadingSeats && (
          <p className="text-sm text-slate-400 py-16 text-center">Loading seat availability…</p>
        )}

        {loadError && (
          <p className="text-sm text-rose-500 py-16 text-center">{loadError}</p>
        )}

        {!isLoadingSeats && !loadError && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            <div className="lg:col-span-8 flex flex-col">
              <SeatGrid
                seats={seats}
                selectedSeatIds={selectedSeatIds}
                onToggleSeat={toggleSeat}
                disabled={isSubmitting}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col">
              <ReservationPanel
                userId={userId}
                onUserIdChange={handleUserIdChange}
                selectedSeatIds={[...selectedSeatIds]}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                isAuthenticating={!token}
                errorMessage={submitError}
                successMessage={submitSuccess}
                lastReservationId={lastReservation?.reservationId ?? null}
                onCancelLastReservation={handleCancelLastReservation}
                isCancelling={isCancelling}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#060810] py-4 text-center text-xs text-slate-500">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Cinema Seat Reservation System</span>
          <span>Next.js • Express • MongoDB ReplicaSet • Socket.IO</span>
        </div>
      </footer>
    </div>
  );
}
