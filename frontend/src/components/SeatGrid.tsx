'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
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
  const rows = useMemo(() => groupByRow(seats), [seats]);

  return (
    <div className="glass-panel-senior flex flex-col justify-between h-full gap-6 rounded-3xl p-5 sm:p-7 shadow-2xl">
      <div>
        {/* Screen Bar */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-4 border-b border-slate-800/80">
          <div className="h-1.5 w-full max-w-md rounded-full bg-gradient-to-r from-indigo-500/20 via-indigo-400 to-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
          <span className="text-[11px] font-extrabold tracking-[0.25em] text-indigo-300 uppercase select-none">
            SCREEN
          </span>
        </div>

        {/* Seat Grid */}
        <div className="overflow-x-auto pb-2 pt-4">
          <div className="min-w-[420px] flex flex-col gap-3.5 items-center">
            {rows.map(([row, rowSeats]) => (
              <div key={row} className="flex items-center gap-3">
                {/* Left Row Identifier */}
                <span className="w-5 text-center text-xs font-black tracking-wider text-slate-400 uppercase select-none">
                  {row}
                </span>

                {/* Seats in Row */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {rowSeats.map((seat) => {
                    const isSelected = selectedSeatIds.has(seat.id);
                    const isReserved = seat.status === 'reserved';

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={isReserved || disabled}
                        onClick={() => onToggleSeat(seat.id)}
                        aria-pressed={isSelected}
                        aria-label={`Seat ${seat.id}, ${seat.status}`}
                        title={`Seat ${seat.id} — ${seat.status}`}
                        className={seatClassName({ isReserved, isSelected })}
                      >
                        {isReserved ? (
                          <Lock className="h-3.5 w-3.5 text-slate-500 opacity-80" />
                        ) : (
                          <span>{seat.number}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Right Row Identifier */}
                <span className="w-5 text-center text-xs font-black tracking-wider text-slate-400 uppercase select-none">
                  {row}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 border-t border-slate-800/80 pt-4 text-xs font-medium">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-md bg-emerald-950/60 border border-emerald-500/40" />
          <span className="text-slate-300">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-md bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          <span className="text-amber-300 font-semibold">Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center">
            <Lock className="h-2.5 w-2.5 text-slate-500" />
          </span>
          <span className="text-slate-500">Reserved</span>
        </div>
      </div>
    </div>
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
    'seat-btn h-9 w-9 sm:h-10 sm:w-10 rounded-xl text-xs font-bold flex items-center justify-center relative focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 select-none';

  if (isReserved) {
    return `${base} bg-slate-900/90 text-slate-600 border border-slate-800/80 cursor-not-allowed opacity-50`;
  }
  if (isSelected) {
    return `${base} bg-amber-400 text-slate-950 border-2 border-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.6)] scale-105 cursor-pointer font-black`;
  }
  return `${base} bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-400 hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 cursor-pointer`;
}
