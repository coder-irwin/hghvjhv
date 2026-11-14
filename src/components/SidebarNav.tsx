import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { ChevronLeft, ChevronRight, LogOut, SlidersHorizontal } from 'lucide-react';
import { BookingPreferences, GoogleCalendarItem } from '../types/booking';

interface SidebarNavProps {
  user: User;
  calendars: GoogleCalendarItem[];
  selectedCalendarId: string;
  selectedDate: Date;
  preferences: BookingPreferences;
  onSelectCalendar: (calendarId: string) => void;
  onSelectDate: (date: Date) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  user,
  calendars,
  selectedCalendarId,
  selectedDate,
  preferences,
  onSelectCalendar,
  onSelectDate,
  onOpenSettings,
  onSignOut,
}) => {
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  const monthDays = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextOffset = cells.length - (firstDayOfWeek + daysInMonth) + 1;
      cells.push({ date: new Date(year, month + 1, nextOffset), inMonth: false });
    }
    return cells;
  }, [monthCursor]);

  const todayKey = new Date().toDateString();
  const selectedKey = selectedDate.toDateString();

  return (
    <aside className="flex w-full flex-col justify-between gap-6 lg:w-[260px] lg:shrink-0">
      <div className="space-y-5">
        {/* Mini Month Navigator */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-semibold text-slate-900">
              {new Intl.DateTimeFormat('en-US', {
                month: 'long',
                year: 'numeric',
              }).format(monthCursor)}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setMonthCursor(
                    new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)
                  )
                }
                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setMonthCursor(
                    new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)
                  )
                }
                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {monthDays.map(({ date, inMonth }, idx) => {
              const key = date.toDateString();
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectDate(date)}
                  className={`flex h-7 w-full items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-blue-600 font-semibold text-white'
                      : isToday
                        ? 'border border-blue-200 bg-blue-50 font-semibold text-blue-700'
                        : inMonth
                          ? 'text-slate-700 hover:bg-slate-100'
                          : 'text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Connected Google Calendars */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold text-slate-900">
              Google Calendars
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-slate-400">
              {calendars.length}
            </span>
          </div>

          <div className="mt-3 space-y-1">
            {calendars.length === 0 ? (
              <p className="text-xs text-slate-400">Loading calendars...</p>
            ) : (
              calendars.map((cal) => {
                const active = cal.id === selectedCalendarId;
                return (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => onSelectCalendar(cal.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      active
                        ? 'bg-slate-100 font-medium text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: cal.backgroundColor || '#2563EB' }}
                    />
                    <span className="min-w-0 flex-1 truncate">{cal.summary}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Concierge Rules Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold text-slate-900">
              Booking Rules
            </h2>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Edit booking rules"
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Voice</dt>
              <dd className="font-medium text-slate-800">{preferences.voiceName}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Hours</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {preferences.workingHoursStart}–{preferences.workingHoursEnd}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Default slot</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {preferences.defaultDurationMinutes} min
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Authenticated Account Footer */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Google account avatar'}
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
              {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900">
              {user.displayName || 'Google User'}
            </p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
