'use client';

import { useMemo, useState, memo } from 'react';
import { Monitor, Check, Lock, Sparkles, X, Info } from 'lucide-react';
import type { Seat } from '@/types/reservation';

type SeatGridProps = {
  seats: Seat[];
  selectedSeatIds: Set<string>;
  onToggleSeat: (seatId: string) => void;
  disabled?: boolean;
  onClearSelection?: () => void;
  onSelectQuickSeats?: (count: number) => void;
};

export function SeatGrid({
  seats,
  selectedSeatIds,
  onToggleSeat,
  disabled = false,
  onClearSelection,
  onSelectQuickSeats,
}: SeatGridProps) {
  const [hoveredSeat, setHoveredSeat] = useState<Seat | null>(null);

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
    <div className="glass-panel-senior relative flex flex-col gap-6 rounded-3xl p-4 sm:p-7 lg:p-8 overflow-hidden">
      {/* Top Projector Ambient Glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-4/5 h-44 screen-ambient-glow blur-3xl opacity-70" />

      {/* Screen Header */}
      <div className="relative flex flex-col items-center gap-2 pt-1 pb-4">
        <div className="relative w-full max-w-lg">
          <div className="h-2 w-full rounded-t-full screen-arc-glow" />
          <div className="h-8 w-full bg-gradient-to-b from-indigo-500/15 via-purple-500/5 to-transparent blur-md -mt-0.5" />
        </div>
        <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.25em] text-indigo-300 uppercase select-none">
          <Monitor className="h-3.5 w-3.5 text-indigo-400" />
          <span>Screen</span>
        </div>
      </div>

      {/* Quick Action & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-800/80 py-3">
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span className="text-slate-300 font-semibold">{stats.available} Available</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span className="text-amber-300 font-bold">{stats.selected} Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
            <span className="text-slate-400 font-semibold">{stats.reserved} Reserved</span>
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2">
          {onSelectQuickSeats && (
            <button
              type="button"
              disabled={disabled || stats.available === 0}
              onClick={() => onSelectQuickSeats(2)}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-indigo-300 transition-all hover:bg-indigo-600 hover:text-white hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] disabled:opacity-40 disabled:pointer-events-none"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>Auto 2 Seats</span>
            </button>
          )}
          {stats.selected > 0 && onClearSelection && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClearSelection}
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-300 transition-all hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear ({stats.selected})</span>
            </button>
          )}
        </div>
      </div>

      {/* Realistic Cinema Seating Grid with Central Aisle */}
      <div className="overflow-x-auto pb-4 pt-2">
        <div className="min-w-[460px] flex flex-col gap-3.5 items-center">
          {rows.map(([row, rowSeats]) => {
            const leftBlock = rowSeats.slice(0, 5);
            const rightBlock = rowSeats.slice(5, 10);

            return (
              <div key={row} className="flex items-center gap-3 sm:gap-4">
                {/* Left Row Identifier */}
                <span className="w-5 text-center text-xs font-black tracking-wider text-slate-400 uppercase select-none">
                  {row}
                </span>

                {/* Left Seat Block (Seats 1-5) */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {leftBlock.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      isSelected={selectedSeatIds.has(seat.id)}
                      disabled={disabled}
                      onToggle={onToggleSeat}
                      onHover={setHoveredSeat}
                    />
                  ))}
                </div>

                {/* Center Theater Aisle Gap */}
                <div className="w-6 sm:w-8 flex items-center justify-center">
                  <span className="h-4 w-px bg-slate-800/80" />
                </div>

                {/* Right Seat Block (Seats 6-10) */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {rightBlock.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      isSelected={selectedSeatIds.has(seat.id)}
                      disabled={disabled}
                      onToggle={onToggleSeat}
                      onHover={setHoveredSeat}
                    />
                  ))}
                </div>

                {/* Right Row Identifier */}
                <span className="w-5 text-center text-xs font-black tracking-wider text-slate-400 uppercase select-none">
                  {row}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Tooltip Bar */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          {hoveredSeat ? (
            <span>
              Seat <strong className="text-white font-bold">{hoveredSeat.id}</strong> —{' '}
              <span
                className={
                  hoveredSeat.status === 'available'
                    ? 'text-emerald-400 font-bold'
                    : 'text-rose-400 font-bold'
                }
              >
                {hoveredSeat.status.toUpperCase()}
              </span>
            </span>
          ) : (
            <span>Click any available seat to select for your reservation</span>
          )}
        </div>
        <div className="hidden sm:block text-slate-500 font-mono text-[11px]">
          50 Seats • Central Aisle
        </div>
      </div>
    </div>
  );
}

const SeatButton = memo(function SeatButton({
  seat,
  isSelected,
  disabled,
  onToggle,
  onHover,
}: {
  seat: Seat;
  isSelected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
  onHover: (seat: Seat | null) => void;
}) {
  const isReserved = seat.status === 'reserved';

  return (
    <button
      type="button"
      disabled={isReserved || disabled}
      onClick={() => onToggle(seat.id)}
      onMouseEnter={() => onHover(seat)}
      onMouseLeave={() => onHover(null)}
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
});

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
    return `${base} bg-gradient-to-tr from-amber-400 to-amber-500 text-slate-950 border-2 border-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.65)] scale-105 cursor-pointer font-black`;
  }
  return `${base} bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-400 hover:shadow-[0_0_18px_rgba(16,185,129,0.55)] hover:scale-105 active:scale-95 cursor-pointer`;
}
