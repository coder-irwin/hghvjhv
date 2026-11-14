import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  BookingPreferences,
  GoogleCalendarItem,
  VoicePreset,
} from '../types/booking';

interface SettingsViewProps {
  preferences: BookingPreferences;
  calendars: GoogleCalendarItem[];
  selectedCalendarId: string;
  onUpdatePreferences: (next: BookingPreferences) => void;
  onSelectCalendar: (calendarId: string) => void;
  onReauth: () => void;
}

const VOICES: Array<{ name: VoicePreset; tone: string }> = [
  { name: 'Zephyr', tone: 'Warm, balanced concierge' },
  { name: 'Kore', tone: 'Clear, calm executive' },
  { name: 'Puck', tone: 'Energetic, upbeat host' },
  { name: 'Charon', tone: 'Composed, deep studio' },
  { name: 'Fenrir', tone: 'Direct, crisp scheduler' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  preferences,
  calendars,
  selectedCalendarId,
  onUpdatePreferences,
  onSelectCalendar,
  onReauth,
}) => {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Voice Concierge & Scheduling Preferences
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          These rules guide Gemini Live when parsing client availability requests and proposing new
          calendar bookings.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Business / Desk Name
            </label>
            <input
              type="text"
              value={preferences.businessName}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, businessName: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
              placeholder="VoxCal Scheduling"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Default Booking Duration
            </label>
            <select
              value={preferences.defaultDurationMinutes}
              onChange={(e) =>
                onUpdatePreferences({
                  ...preferences,
                  defaultDurationMinutes: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Working Hours Start
            </label>
            <input
              type="time"
              value={preferences.workingHoursStart}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, workingHoursStart: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Working Hours End
            </label>
            <input
              type="time"
              value={preferences.workingHoursEnd}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, workingHoursEnd: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-medium text-slate-700">
            Concierge Voice Persona
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {VOICES.map((voice) => {
              const selected = preferences.voiceName === voice.name;
              return (
                <button
                  key={voice.name}
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({ ...preferences, voiceName: voice.name })
                  }
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold">{voice.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{voice.tone}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-medium text-slate-700">
            Custom Scheduling Instructions
          </label>
          <textarea
            rows={3}
            value={preferences.conciergeInstructions}
            onChange={(e) =>
              onUpdatePreferences({
                ...preferences,
                conciergeInstructions: e.target.value,
              })
            }
            placeholder="e.g. Prefer Google Meet links for client demos, keep Fridays open after 2 PM."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Google Calendar Sync Target
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose which Google Calendar receives new voice-booked appointments.
            </p>
          </div>
          <button
            type="button"
            onClick={onReauth}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Refresh Google Permissions
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {calendars.map((cal) => {
            const active = cal.id === selectedCalendarId;
            return (
              <button
                key={cal.id}
                type="button"
                onClick={() => onSelectCalendar(cal.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: cal.backgroundColor || '#2563EB' }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {cal.summary}
                    </div>
                    <div className="text-xs text-slate-500">
                      {cal.timeZone || 'UTC'} · {cal.accessRole || 'owner'}
                    </div>
                  </div>
                </div>
                {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
