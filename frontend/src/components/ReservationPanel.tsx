'use client';

import { useState } from 'react';
import { User, Ticket, Sparkles, CheckCircle2, AlertCircle, RefreshCw, X, ShieldCheck, Copy, Check } from 'lucide-react';

type ReservationPanelProps = {
  userId: string;
  onUserIdChange: (id: string) => void;
  selectedSeatIds: string[];
  onSubmit: () => void;
  isSubmitting: boolean;
  isAuthenticating: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  lastReservationId: string | null;
  onCancelLastReservation: () => void;
  isCancelling: boolean;
};

export function ReservationPanel({
  userId,
  onUserIdChange,
  selectedSeatIds,
  onSubmit,
  isSubmitting,
  isAuthenticating,
  errorMessage,
  successMessage,
  lastReservationId,
  onCancelLastReservation,
  isCancelling,
}: ReservationPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyReservationId = () => {
    if (!lastReservationId) return;
    navigator.clipboard.writeText(lastReservationId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card relative flex flex-col gap-6 rounded-3xl p-5 sm:p-6 shadow-2xl overflow-hidden">
      {/* Header Title */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 pt-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Reserve Seats</h2>
            <p className="text-xs text-slate-400">Enter User ID and submit selection</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-medium border border-slate-800 text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>{isAuthenticating ? 'Auth...' : 'JWT Auth'}</span>
        </div>
      </div>

      {/* User ID Field */}
      <div className="flex flex-col gap-2">
        <label htmlFor="userId" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <User className="h-3.5 w-3.5 text-indigo-400" />
          <span>User Identity</span>
        </label>
        <div className="relative">
          <input
            id="userId"
            type="text"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder="e.g. user_101"
            className="w-full rounded-2xl bg-slate-950/80 border border-slate-800/90 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all font-mono shadow-inner"
          />
        </div>
      </div>

      {/* Selected Seats Chips */}
      <div className="flex flex-col gap-2.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>Selected Seats</span>
          <span className="font-bold text-amber-300">{selectedSeatIds.length} Selected</span>
        </div>

        {selectedSeatIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {selectedSeatIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-300 shadow-sm"
              >
                <span>Seat {id}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-slate-500 py-1">No seats selected. Tap available seats in the grid.</p>
        )}
      </div>

      {/* Shimmer Reserve CTA Button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || isAuthenticating || selectedSeatIds.length === 0 || !userId.trim()}
        className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-4 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-600/20 transition-all duration-200 hover:shadow-indigo-600/35 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {isSubmitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-white" />
              <span>Reserving Seats...</span>
            </>
          ) : isAuthenticating ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-white" />
              <span>Authenticating Session...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>
                Reserve {selectedSeatIds.length > 0 ? `${selectedSeatIds.length} Seat${selectedSeatIds.length > 1 ? 's' : ''}` : 'Now'}
              </span>
            </>
          )}
        </span>
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-shimmer" />
      </button>

      {/* Senior Feedback Alert Banners */}
      {errorMessage && (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-rose-950/40 border border-rose-800/60 p-3.5 text-xs text-rose-300 shadow-lg">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 p-3.5 text-xs text-emerald-300 shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
        </div>
      )}

      {/* Confirmed Reservation Ticket Card */}
      {lastReservationId && (
        <div className="mt-1 flex flex-col gap-3 rounded-2xl bg-slate-950/90 border border-indigo-500/30 p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Confirmed Reservation</span>
            </div>
            <button
              type="button"
              onClick={handleCopyReservationId}
              className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400 font-medium">Reservation Code:</span>
            <span className="font-mono text-indigo-200 text-xs break-all bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              {lastReservationId}
            </span>
          </div>

          <button
            type="button"
            onClick={onCancelLastReservation}
            disabled={isCancelling}
            className="flex items-center justify-center gap-2 rounded-xl border border-rose-800/60 bg-rose-950/30 py-2.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-900/50 hover:text-white disabled:opacity-50"
          >
            {isCancelling ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Cancelling...</span>
              </>
            ) : (
              <>
                <X className="h-3.5 w-3.5" />
                <span>Cancel Reservation</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
