'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Film, Users, RefreshCw, AlertCircle } from 'lucide-react';
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

    // Optimistic UI: reflect the booking immediately
    setSeats((current) =>
      current.map((s) =>
        optimisticSeatIds.includes(s.id) ? { ...s, status: 'reserved' as const } : s,
      ),
    );
    setSelectedSeatIds(new Set());

    const idempotencyKey = crypto.randomUUID();

    try {
      const reservation = await reserveSeats(token, userId, optimisticSeatIds, idempotencyKey);
      setSubmitSuccess(`Successfully reserved seat(s) ${reservation.seats.join(', ')}.`);
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
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Navbar Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#060911]/90 backdrop-blur-xl px-4 sm:px-8 py-3.5 shadow-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">ORBIT CINEMA</h1>
                <span className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  Real-Time
                </span>
              </div>
              <p className="text-xs text-slate-400">High-concurrency cinema seat reservation system</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Socket Indicator */}
            <div className="flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-800 px-3 py-1.5 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 beacon-online' : 'bg-rose-500 animate-pulse'}`} />
              <span className="font-medium text-slate-300">
                {isConnected ? 'Socket Live' : 'Reconnecting...'}
              </span>
            </div>

            {/* Total Seats Badge */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-indigo-950/40 border border-indigo-500/30 px-3 py-1.5 text-xs text-indigo-300 font-medium">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              <span>50 Seats Total</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {isLoadingSeats && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-400">Connecting to seat inventory stream...</p>
          </div>
        )}

        {loadError && (
          <div className="mx-auto max-w-lg rounded-3xl bg-rose-950/40 border border-rose-800 p-6 flex flex-col items-center text-center gap-3 shadow-2xl">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <h3 className="text-lg font-bold text-white">Connection Failure</h3>
            <p className="text-xs text-rose-300">{loadError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 rounded-2xl bg-rose-900 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {!isLoadingSeats && !loadError && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-8">
              <SeatGrid
                seats={seats}
                selectedSeatIds={selectedSeatIds}
                onToggleSeat={toggleSeat}
                disabled={isSubmitting}
              />
            </div>
            <div className="lg:col-span-4">
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
      <footer className="mt-auto border-t border-slate-800/80 bg-[#060911] px-4 py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-semibold text-slate-400">Orbit Cinema System</span>
          <span>Distributed Concurrency Control • Next.js, Express, MongoDB ReplicaSet & Socket.IO</span>
        </div>
      </footer>
    </div>
  );
}
