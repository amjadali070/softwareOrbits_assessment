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
    <div className="flex flex-col gap-3 rounded border border-gray-200 p-4">
      <div>
        <label htmlFor="userId" className="block text-sm font-medium text-gray-700">
          User ID
        </label>
        <input
          id="userId"
          type="text"
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700">Selected seats</p>
        <p className="text-sm text-gray-600">
          {selectedSeatIds.length > 0 ? selectedSeatIds.join(', ') : 'None'}
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={
          isSubmitting || isAuthenticating || selectedSeatIds.length === 0 || !userId.trim()
        }
        className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isSubmitting
          ? 'Reserving…'
          : isAuthenticating
            ? 'Authenticating…'
            : `Reserve ${selectedSeatIds.length || ''} seat${selectedSeatIds.length === 1 ? '' : 's'}`}
      </button>

      {errorMessage && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p role="status" className="text-sm text-green-600">
          {successMessage}
        </p>
      )}

      {lastReservationId && (
        <button
          type="button"
          onClick={onCancelLastReservation}
          disabled={isCancelling}
          className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCancelling ? 'Cancelling…' : 'Cancel this reservation'}
        </button>
      )}
    </div>
  );
}
