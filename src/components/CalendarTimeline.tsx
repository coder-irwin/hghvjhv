import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { CalendarEvent, CalendarViewMode, GoogleCalendarItem } from '../types/booking';
import {
  formatDateHeading,
  formatTimeShort,
  getWeekRange,
} from '../lib/audioUtils';

interface CalendarTimelineProps {
  events: CalendarEvent[];
  selectedDate: Date;
  viewMode: CalendarViewMode;
  activeCalendar: GoogleCalendarItem | undefined;
  searchQuery: string;
  isLoading: boolean;
  errorMessage: string | null;
  onChangeDate: (date: Date) => void;
  onChangeViewMode: (mode: CalendarViewMode) => void;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onNewBooking: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
}

export const CalendarTimeline: React.FC<CalendarTimelineProps> = ({
  events,
  selectedDate,
  viewMode,
  activeCalendar,
  searchQuery,
  isLoading,
  errorMessage,
  onChangeDate,
  onChangeViewMode,
  onSearchChange,
  onRefresh,
  onNewBooking,
  onEditEvent,
  onDeleteEvent,
}) => {
  const timeZone = activeCalendar?.timeZone;

  const filteredEvents = events.filter((ev) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const haystack = [
      ev.summary,
      ev.description,
      ev.location,
      ...(ev.attendees || []).map((a) => `${a.displayName || ''} ${a.email}`),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  const shiftDate = (delta: number) => {
    const next = new Date(selectedDate);
    if (viewMode === 'week') {
      next.setDate(next.getDate() + delta * 7);
    } else {
      next.setDate(next.getDate() + delta);
    }
    onChangeDate(next);
  };

  const weekDays = getWeekRange(selectedDate).days;

  const renderEventRow = (ev: CalendarEvent) => {
    const startStr = ev.start?.dateTime
      ? formatTimeShort(ev.start.dateTime, timeZone)
      : 'All day';
    const endStr = ev.end?.dateTime ? formatTimeShort(ev.end.dateTime, timeZone) : '';
    const attendeesCount = ev.attendees?.length || 0;

    return (
      <div
        key={ev.id}
        className="group flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-colors hover:border-slate-300 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div className="w-28 shrink-0 pt-0.5">
            <div className="font-mono text-xs font-medium tabular-nums text-slate-900">
              {startStr}
            </div>
            {endStr && (
              <div className="font-mono text-[11px] tabular-nums text-slate-500">
                to {endStr}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-sm font-semibold text-slate-900">
                {ev.summary || '(Untitled Event)'}
              </h3>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {ev.location && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="max-w-[180px] truncate">{ev.location}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {attendeesCount > 0 && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>
                      {attendeesCount} {attendeesCount === 1 ? 'attendee' : 'attendees'}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{ev.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          {ev.hangoutLink && (
            <a
              href={ev.hangoutLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Video className="h-3.5 w-3.5 text-blue-600" />
              <span>Meet</span>
            </a>
          )}
          {ev.htmlLink && (
            <a
              href={ev.htmlLink}
              target="_blank"
              rel="noreferrer"
              title="Open in Google Calendar"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onEditEvent(ev)}
            title="Reschedule or edit booking"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteEvent(ev)}
            title="Cancel booking"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-lg font-semibold text-slate-900">
              {viewMode === 'week'
                ? 'Weekly Schedule'
                : viewMode === 'agenda'
                  ? 'Upcoming Bookings'
                  : formatDateHeading(selectedDate)}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {activeCalendar?.summary || 'Primary Calendar'}
            {timeZone ? ` · ${timeZone}` : ''}
            {` · ${filteredEvents.length} ${filteredEvents.length === 1 ? 'event' : 'events'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(['day', 'week', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* Sub-toolbar: Date Nav & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChangeDate(new Date())}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Previous date range"
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            aria-label="Next date range"
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh Google Calendar"
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter bookings or clients..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="p-5">
        {errorMessage && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-md bg-white px-2.5 py-1 font-medium text-red-700 shadow-xs hover:bg-red-50 whitespace-nowrap shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
                <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
              <Calendar className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-display text-sm font-semibold text-slate-900">
              No bookings scheduled for this window
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Use the Voice Booking Concierge to book a client slot verbally, or create an event
              manually.
            </p>
            <button
              type="button"
              onClick={onNewBooking}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create First Booking</span>
            </button>
          </div>
        ) : viewMode === 'week' ? (
          <div className="space-y-5">
            {weekDays.map((dayDate) => {
              const dayKey = dayDate.toDateString();
              const dayEvents = filteredEvents.filter((ev) => {
                const raw = ev.start?.dateTime || ev.start?.date;
                if (!raw) return false;
                return new Date(raw).toDateString() === dayKey;
              });

              return (
                <div key={dayKey} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-display text-xs font-semibold text-slate-700">
                      {new Intl.DateTimeFormat('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      }).format(dayDate)}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                      {dayEvents.length} {dayEvents.length === 1 ? 'booking' : 'bookings'}
                    </span>
                  </div>
                  {dayEvents.length === 0 ? (
                    <p className="py-1 text-xs text-slate-400">Open availability</p>
                  ) : (
                    <div className="space-y-2">{dayEvents.map(renderEventRow)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {viewMode === 'agenda'
              ? filteredEvents.map((ev) => {
                  const dateLabel = new Intl.DateTimeFormat('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }).format(new Date(ev.start?.dateTime || ev.start?.date || Date.now()));
                  return (
                    <div key={ev.id} className="space-y-1">
                      <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>{dateLabel}</span>
                      </div>
                      {renderEventRow(ev)}
                    </div>
                  );
                })
              : filteredEvents.map(renderEventRow)}
          </div>
        )}
      </div>
    </section>
  );
};
