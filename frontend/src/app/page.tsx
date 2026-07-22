'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Zap, RefreshCw, X } from 'lucide-react';
import { SeatGrid } from '@/components/SeatGrid';
import { ReservationPanel } from '@/components/ReservationPanel';
import {
  ApiError,
  cancelReservation,
  fetchSeats,
  login,
  reserveSeats,
  runSimulationApi,
  type SimulationResultDto,
} from '@/lib/api';
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

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSummary, setSimulationSummary] = useState<SimulationResultDto | null>(null);

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

  const handleRunSimulation = useCallback(async () => {
    setIsSimulating(true);
    setSimulationSummary(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const result = await runSimulationApi(100);
      setSimulationSummary(result);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setIsSimulating(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#060810] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Header Navbar */}
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

          <div className="flex items-center gap-3">
            {/* Simulation Trigger Button */}
            <button
              type="button"
              disabled={isSimulating}
              onClick={handleRunSimulation}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:shadow-purple-500/30 hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Trigger 100-user concurrent reservation simulation across frontend and partner routes"
            >
              {isSimulating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Simulating 100 Users...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 text-amber-300" />
                  <span>Simulate 100 Users</span>
                </>
              )}
            </button>

            {/* Socket Indicator */}
            <div className="flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-800 px-3 py-1.5 text-xs font-medium">
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 beacon-pulse-active' : 'bg-rose-500 animate-pulse'}`} />
              <span className="text-slate-300">
                {isConnected ? 'Socket Live' : 'Reconnecting...'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 flex flex-col gap-6">
        {/* Simulation Summary Banner */}
        {simulationSummary && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 px-4 py-3 text-xs text-indigo-200 shadow-lg">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-300 shrink-0" />
              <span>
                <strong>Simulation Complete:</strong> Fired {simulationSummary.totalAttempts} concurrent requests in {simulationSummary.elapsedMs}ms —{' '}
                <span className="text-emerald-400 font-bold">{simulationSummary.successful} Successful</span> ({simulationSummary.successfulFrontend} frontend, {simulationSummary.successfulPartner} partner),{' '}
                <span className="text-amber-300 font-semibold">{simulationSummary.conflicts} Conflicts (409)</span>,{' '}
                <span className="text-emerald-400 font-bold">{simulationSummary.doubleBookedCount} Double-Bookings</span>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSimulationSummary(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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
                disabled={isSubmitting || isSimulating}
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
