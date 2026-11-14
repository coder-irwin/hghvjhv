import { BusySlot, CalendarEvent, GoogleCalendarItem } from '../types/booking';

export class AuthExpiredError extends Error {
  constructor(message = 'Google Calendar session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

async function handleJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new AuthExpiredError();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Calendar API error (${res.status})`);
  }
  return data as T;
}

export async function fetchCalendars(accessToken: string): Promise<GoogleCalendarItem[]> {
  const res = await fetch('/api/calendar/calendars', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleJsonResponse<{ items: GoogleCalendarItem[] }>(res);
  return data.items || [];
}

export async function fetchEvents(
  accessToken: string,
  params: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
    q?: string;
  }
): Promise<CalendarEvent[]> {
  const search = new URLSearchParams({
    calendarId: params.calendarId,
    timeMin: params.timeMin,
    timeMax: params.timeMax,
  });
  if (params.q) search.set('q', params.q);

  const res = await fetch(`/api/calendar/events?${search.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleJsonResponse<{ items: CalendarEvent[] }>(res);
  return data.items || [];
}

export async function fetchFreeBusy(
  accessToken: string,
  params: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
    timeZone: string;
  }
): Promise<BusySlot[]> {
  const res = await fetch('/api/calendar/freebusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const data = await handleJsonResponse<{ busy: BusySlot[] }>(res);
  return data.busy || [];
}

export async function createCalendarEvent(
  accessToken: string,
  payload: {
    calendarId: string;
    summary: string;
    startIso: string;
    endIso: string;
    timeZone: string;
    description?: string;
    location?: string;
    attendeeEmail?: string;
    attendeeName?: string;
    createMeetLink?: boolean;
  }
): Promise<CalendarEvent> {
  const res = await fetch('/api/calendar/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleJsonResponse<CalendarEvent>(res);
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  payload: {
    calendarId: string;
    summary?: string;
    startIso?: string;
    endIso?: string;
    timeZone: string;
    description?: string;
    location?: string;
  }
): Promise<CalendarEvent> {
  const res = await fetch(`/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleJsonResponse<CalendarEvent>(res);
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId: string
): Promise<void> {
  const res = await fetch(
    `/api/calendar/events/${encodeURIComponent(eventId)}?calendarId=${encodeURIComponent(calendarId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  await handleJsonResponse<{ deleted: boolean }>(res);
}
