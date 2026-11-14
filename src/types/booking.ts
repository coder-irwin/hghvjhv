export type VoicePreset = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export type VoiceSessionStatus =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export type CalendarViewMode = 'day' | 'week' | 'agenda';

export type AppNavTab = 'schedule' | 'voice' | 'bookings' | 'settings';

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
}

export interface CalendarEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start: CalendarEventDateTime;
  end: CalendarEventDateTime;
  attendees?: CalendarAttendee[];
  creator?: { email?: string; displayName?: string };
  organizer?: { email?: string; displayName?: string };
}

export interface BusySlot {
  start: string;
  end: string;
}

export type ProposalAction = 'create' | 'update' | 'delete';

export interface PendingBookingProposal {
  id: string;
  action: ProposalAction;
  calendarId: string;
  eventId?: string;
  summary: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  clientName?: string;
  clientEmail?: string;
  location?: string;
  description?: string;
  createMeetLink?: boolean;
  reason?: string;
  originalEvent?: CalendarEvent;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  timestamp: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResultSummary?: string;
  isFinal?: boolean;
}

export interface ParsedIntentSnapshot {
  id: string;
  timestamp: string;
  toolName: string;
  summary: string;
  details: Record<string, unknown>;
  status: 'checked' | 'awaiting_confirmation' | 'synced' | 'cancelled';
}

export interface BookingPreferences {
  voiceName: VoicePreset;
  workingHoursStart: string; // e.g. "09:00"
  workingHoursEnd: string;   // e.g. "17:00"
  defaultDurationMinutes: number;
  businessName: string;
  conciergeInstructions: string;
}
