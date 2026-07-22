'use client';

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
  return (
    <div className="glass-panel-senior flex flex-col gap-5 rounded-3xl p-5 sm:p-6 shadow-2xl">
      <h2 className="text-base font-bold text-white border-b border-slate-800/80 pb-3">
        Reserve Seats
      </h2>

      {/* User ID Field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="userId" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          User ID
        </label>
        <input
          id="userId"
          type="text"
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
          placeholder="Enter your User ID"
          className="w-full rounded-2xl bg-slate-950/80 border border-slate-800/90 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all font-mono shadow-inner"
        />
      </div>

      {/* Selected Seats */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Selected Seats
        </span>
        <div className="min-h-11 rounded-2xl bg-slate-950/60 border border-slate-800/80 px-4 py-3 text-sm flex items-center">
          {selectedSeatIds.length > 0 ? (
            <span className="font-bold text-amber-300 font-mono">
              {selectedSeatIds.join(', ')}
            </span>
          ) : (
            <span className="text-slate-500 text-xs italic">None selected</span>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || isAuthenticating || selectedSeatIds.length === 0 || !userId.trim()}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3.5 text-sm font-bold text-white shadow-xl transition-all hover:shadow-indigo-500/25 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        {isSubmitting
          ? 'Reserving…'
          : isAuthenticating
            ? 'Authenticating…'
            : `Reserve ${selectedSeatIds.length || ''} seat${selectedSeatIds.length === 1 ? '' : 's'}`}
      </button>

      {/* Error & Success Messages */}
      {errorMessage && (
        <div role="alert" className="rounded-2xl bg-rose-950/40 border border-rose-800/60 p-3.5 text-xs font-medium text-rose-300">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div role="status" className="rounded-2xl bg-emerald-950/40 border border-emerald-800/60 p-3.5 text-xs font-medium text-emerald-300">
          {successMessage}
        </div>
      )}

      {/* Cancel Last Reservation */}
      {lastReservationId && (
        <div className="flex flex-col gap-2 rounded-2xl bg-slate-950/80 border border-slate-800/90 p-3.5 text-xs">
          <div className="text-slate-400">
            Active Reservation: <span className="font-mono text-indigo-300 break-all">{lastReservationId}</span>
          </div>
          <button
            type="button"
            onClick={onCancelLastReservation}
            disabled={isCancelling}
            className="w-full rounded-xl border border-rose-800/60 bg-rose-950/30 py-2.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-900/50 disabled:opacity-50"
          >
            {isCancelling ? 'Cancelling…' : 'Cancel Reservation'}
          </button>
        </div>
      )}
    </div>
  );
}
