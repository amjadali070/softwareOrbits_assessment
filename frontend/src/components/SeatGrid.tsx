'use client';

import { useMemo } from 'react';
import { Monitor, Check, Lock } from 'lucide-react';
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

  const stats = useMemo(() => {
    let available = 0;
    let reserved = 0;
    for (const seat of seats) {
      if (seat.status === 'available') available++;
      else if (seat.status === 'reserved') reserved++;
    }
    return {
      available,
      reserved,
      selected: selectedSeatIds.size,
      total: seats.length,
    };
  }, [seats, selectedSeatIds]);

  return (
    <div className="glass-card relative flex flex-col gap-6 rounded-3xl p-5 sm:p-7 lg:p-8 overflow-hidden">
      {/* Top Ambient Projection Glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-4/5 h-40 cinema-screen-glow blur-3xl opacity-60" />

      {/* Screen Header */}
      <div className="relative flex flex-col items-center gap-2 pt-2 pb-4">
        
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.25em] text-indigo-300 uppercase">
          <Monitor className="h-3.5 w-3.5 text-indigo-400" />
          <span>Screen</span>
        </div>
      </div>

      {/* Main Seat Grid Container */}
      <div className="overflow-x-auto pb-4 pt-1">
        <div className="min-w-[440px] flex flex-col gap-3.5 items-center">
          {rows.map(([row, rowSeats]) => (
            <div key={row} className="flex items-center gap-3 sm:gap-4">
              {/* Left Row Identifier */}
              <span className="w-5 text-center text-xs font-black tracking-wider text-slate-400 uppercase select-none">
                {row}
              </span>

              {/* Seat Buttons in Row */}
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
                        <Lock className="h-3 w-3 text-slate-600" />
                      ) : isSelected ? (
                        <Check className="h-3.5 w-3.5 stroke-[3] text-slate-950" />
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

      {/* Senior-Grade Legend & Capacity Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-4 text-xs">
        <div className="flex items-center gap-4 sm:gap-6 font-medium">
          {/* Available Pill */}
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-emerald-950/80 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
            <span className="text-slate-300">Available</span>
            <span className="rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
              {stats.available}
            </span>
          </div>

          {/* Selected Pill */}
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-gradient-to-tr from-amber-500 to-yellow-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
            <span className="text-amber-300 font-semibold">Selected</span>
            <span className="rounded-full bg-amber-950/80 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
              {stats.selected}
            </span>
          </div>

          {/* Reserved Pill */}
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-slate-900 border border-slate-800" />
            <span className="text-slate-400">Reserved</span>
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-400 border border-slate-800">
              {stats.reserved}
            </span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-500">
          Capacity: {stats.total} Seats
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
    'h-9 w-9 sm:h-10 sm:w-10 rounded-[10px] text-xs font-bold transition-all duration-200 flex items-center justify-center relative focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 select-none';

  if (isReserved) {
    return `${base} bg-slate-900/90 text-slate-600 border border-slate-800/80 cursor-not-allowed opacity-50`;
  }
  if (isSelected) {
    return `${base} bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 border border-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.6)] scale-105 transform cursor-pointer font-black`;
  }
  return `${base} bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.5)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer`;
}
