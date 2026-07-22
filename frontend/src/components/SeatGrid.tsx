'use client';

import type { Seat } from '@/types/reservation';

type SeatGridProps = {
  seats: Seat[];
  selectedSeatIds: Set<string>;
  onToggleSeat: (seatId: string) => void;
  disabled?: boolean;
};

export function SeatGrid({
  seats,
  selectedSeatIds,
  onToggleSeat,
  disabled = false,
}: SeatGridProps) {
  const rows = groupByRow(seats);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {rows.map(([row, rowSeats]) => (
          <div key={row} className="flex items-center gap-2">
            <span className="w-5 text-sm font-medium text-gray-500">{row}</span>
            <div className="flex flex-wrap gap-1.5">
              {rowSeats.map((seat) => {
                const isSelected = selectedSeatIds.has(seat.id);
                const isReserved = seat.status === 'reserved';
                return (
                  <button
                    key={seat.id}
                    type="button"
                    disabled={isReserved || disabled}
                    onClick={() => onToggleSeat(seat.id)}
                    title={`${seat.id} — ${seat.status}`}
                    aria-pressed={isSelected}
                    className={seatClassName({ isReserved, isSelected })}
                  >
                    {seat.number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <Legend swatchClassName="bg-green-100 border border-green-300" label="Available" />
        <Legend swatchClassName="bg-blue-600" label="Selected" />
        <Legend swatchClassName="bg-gray-300" label="Reserved" />
      </div>
    </div>
  );
}

function Legend({ swatchClassName, label }: { swatchClassName: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${swatchClassName}`} />
      {label}
    </span>
  );
}

function groupByRow(seats: Seat[]): [string, Seat[]][] {
  const map = new Map<string, Seat[]>();
  for (const seat of seats) {
    const list = map.get(seat.row) ?? [];
    list.push(seat);
    map.set(seat.row, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([row, list]) => [row, [...list].sort((a, b) => a.number - b.number)]);
}

function seatClassName({
  isReserved,
  isSelected,
}: {
  isReserved: boolean;
  isSelected: boolean;
}): string {
  const base =
    'h-8 w-8 rounded text-xs font-medium transition-colors flex items-center justify-center';
  if (isReserved) return `${base} bg-gray-300 text-gray-400 cursor-not-allowed`;
  if (isSelected) return `${base} bg-blue-600 text-white cursor-pointer`;
  return `${base} bg-green-100 text-green-800 border border-green-300 hover:bg-green-200 cursor-pointer`;
}
