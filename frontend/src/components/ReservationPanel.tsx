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
    <div className="glass-panel-senior flex flex-col justify-between h-full gap-5 rounded-3xl p-5 sm:p-6 shadow-2xl">
      {/* Top Form Section */}
      <div className="flex flex-col gap-5">
        <h2 className="text-base font-bold text-white border-b border-slate-800/80 pb-3">
          Reserve Seats
        </h2>

        {/* User ID Field */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="userId" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            USER ID
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
            SELECTED SEATS
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
          className="w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-extrabold text-slate-950 shadow-xl transition-all hover:bg-slate-100 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-white"
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
      </div>

      {/* Bottom Reservation Status Box - Replaces empty space when no reservation exists */}
      {lastReservationId ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-slate-950/80 border border-slate-800/90 p-3.5 text-xs mt-auto">
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
      ) : (
        <div className="flex flex-col gap-1 rounded-2xl bg-slate-950/40 border border-slate-800/60 p-3.5 text-xs text-slate-400 mt-auto">
          <span className="font-semibold text-slate-300">Active Reservation Status</span>
          <span className="text-[11px] text-slate-500 italic">No active reservation for this user. Select available seats above to book.</span>
        </div>
      )}
    </div>
  );
}
