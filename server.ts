import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  Behavior,
  FunctionDeclaration,
  FunctionResponseScheduling,
  GoogleGenAI,
  InteractionStatus,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const app = express();
app.use(express.json({ limit: '2mb' }));

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

async function googleCalendarFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (res.status === 204) {
    return { ok: true, status: 204, data: { deleted: true } };
  }

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

// Health endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

// List user's Google Calendars
app.get('/api/calendar/calendars', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Google Calendar authorization token.' });
    return;
  }

  try {
    const result = await googleCalendarFetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
      token
    );
    if (!result.ok) {
      res.status(result.status).json({
        error: result.data?.error?.message || 'Failed to fetch Google Calendars.',
      });
      return;
    }
    res.json({ items: result.data.items || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal calendar proxy error.' });
  }
});

// List events from selected calendar
app.get('/api/calendar/events', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Google Calendar authorization token.' });
    return;
  }

  const calendarId = String(req.query.calendarId || 'primary');
  const timeMin = req.query.timeMin ? String(req.query.timeMin) : undefined;
  const timeMax = req.query.timeMax ? String(req.query.timeMax) : undefined;
  const q = req.query.q ? String(req.query.q) : undefined;

  const qs = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  if (timeMin) qs.set('timeMin', timeMin);
  if (timeMax) qs.set('timeMax', timeMax);
  if (q) qs.set('q', q);

  try {
    const result = await googleCalendarFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
      token
    );
    if (!result.ok) {
      res.status(result.status).json({
        error: result.data?.error?.message || 'Failed to fetch calendar events.',
      });
      return;
    }
    res.json({ items: result.data.items || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal calendar proxy error.' });
  }
});

// Check FreeBusy availability
app.post('/api/calendar/freebusy', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Google Calendar authorization token.' });
    return;
  }

  const { calendarId = 'primary', timeMin, timeMax, timeZone = 'UTC' } = req.body || {};
  if (!timeMin || !timeMax) {
    res.status(400).json({ error: 'timeMin and timeMax are required.' });
    return;
  }

  try {
    const result = await googleCalendarFetch(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone,
          items: [{ id: calendarId }],
        }),
      }
    );
    if (!result.ok) {
      res.status(result.status).json({
        error: result.data?.error?.message || 'Failed to check free/busy availability.',
      });
      return;
    }
    const busy = result.data?.calendars?.[calendarId]?.busy || [];
    res.json({ busy });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal freebusy error.' });
  }
});

// Create a calendar event (only triggered after explicit user confirmation in UI)
app.post('/api/calendar/events', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Google Calendar authorization token.' });
    return;
  }

  const {
    calendarId = 'primary',
    summary,
    startIso,
    endIso,
    timeZone = 'UTC',
    description,
    location,
    attendeeEmail,
    attendeeName,
    createMeetLink,
  } = req.body || {};

  if (!summary || !startIso || !endIso) {
    res.status(400).json({ error: 'summary, startIso, and endIso are required.' });
    return;
  }

  const eventPayload: Record<string, any> = {
    summary,
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone },
  };
  if (description) eventPayload.description = description;
  if (location) eventPayload.location = location;
  if (attendeeEmail) {
    eventPayload.attendees = [
      {
        email: attendeeEmail,
        ...(attendeeName ? { displayName: attendeeName } : {}),
      },
    ];
  }
  if (createMeetLink) {
    eventPayload.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  try {
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const url = createMeetLink ? `${baseUrl}?conferenceDataVersion=1` : baseUrl;
    let result = await googleCalendarFetch(url, token, {
      method: 'POST',
      body: JSON.stringify(eventPayload),
    });

    // If conferenceData isn't supported on this calendar type, fallback gracefully without Meet link
    if (!result.ok && createMeetLink && result.status === 400) {
      delete eventPayload.conferenceData;
      result = await googleCalendarFetch(baseUrl, token, {
        method: 'POST',
        body: JSON.stringify(eventPayload),
      });
    }

    if (!result.ok) {
      res.status(result.status).json({
        error: result.data?.error?.message || 'Failed to create Google Calendar event.',
      });
      return;
    }
    res.status(201).json(result.data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create event.' });
  }
});

// Update/reschedule an existing calendar event
app.patch('/api/calendar/events/:eventId', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Google Calendar authorization token.' });
    return;
  }

  const eventId = req.params.eventId;
  const {
    calendarId = 'primary',
    summary,
    startIso,
    endIso,
    timeZone = 'UTC',
    description,
    location,
  } = req.body || {};

  const patchPayload: Record<string, any> = {};
  if (summary !== undefined) patchPayload.summary = summary;
  if (description !== undefined) patchPayload.description = description;
  if (location !== undefined) patchPayload.location = location;
  if (startIso) patchPayload.start = { dateTime: startIso, timeZone };
  if (endIso) patchPayload.end = { dateTime: endIso, timeZone };

  try {
    const result = await googleCalendarFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify(patchPayload),
      }
    );
    if (!result.ok) {
      res.status(result.status).json({
        error: result.data?.error?.message || 'Failed to update calendar event.',
      });
      return;
    }
    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update event.' });
  }
});

// Delete/cancel a calendar event
app.delete('/api/calendar/events/:eventId', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Google Calendar authorization token.' });
    return;
  }

  const eventId = req.params.eventId;
  const calendarId = String(req.query.calendarId || 'primary');

  try {
    const result = await googleCalendarFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      token,
      { method: 'DELETE' }
    );
    if (!result.ok) {
      res.status(result.status).json({
        error: result.data?.error?.message || 'Failed to delete calendar event.',
      });
      return;
    }
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete event.' });
  }
});

// Gemini Live non-blocking function declarations for voice intent parsing & Calendar sync
const calendarToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'check_availability',
    description:
      'Checks Google Calendar availability and existing events for a given ISO time range. Always call this before proposing or confirming a booking slot.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        startIso: {
          type: Type.STRING,
          description:
            'ISO 8601 start timestamp with timezone offset (e.g. 2026-11-15T00:00:00-08:00).',
        },
        endIso: {
          type: Type.STRING,
          description:
            'ISO 8601 end timestamp with timezone offset (e.g. 2026-11-15T23:59:59-08:00).',
        },
      },
      required: ['startIso', 'endIso'],
    },
  },
  {
    name: 'list_upcoming_bookings',
    description:
      'Lists existing Google Calendar events in a time range, optionally filtered by client name or title keyword. Use this when looking up meetings to reschedule, cancel, or summarize.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        timeMin: {
          type: Type.STRING,
          description: 'ISO 8601 lower bound timestamp with timezone offset.',
        },
        timeMax: {
          type: Type.STRING,
          description: 'ISO 8601 upper bound timestamp with timezone offset.',
        },
        query: {
          type: Type.STRING,
          description: 'Optional search term (client name, topic, or email).',
        },
      },
      required: ['timeMin', 'timeMax'],
    },
  },
  {
    name: 'propose_booking',
    description:
      'Submits a structured new booking intent to the user interface for explicit confirmation before syncing to Google Calendar. Call this after verifying availability and collecting title, start time, and duration.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Clear event title, e.g. "Product Demo with Maya Chen".',
        },
        startIso: {
          type: Type.STRING,
          description: 'ISO 8601 start date-time with timezone offset.',
        },
        endIso: {
          type: Type.STRING,
          description: 'ISO 8601 end date-time with timezone offset.',
        },
        clientName: {
          type: Type.STRING,
          description: 'Client or guest full name if mentioned.',
        },
        clientEmail: {
          type: Type.STRING,
          description: 'Client or guest email address if mentioned.',
        },
        location: {
          type: Type.STRING,
          description: 'Meeting location or video call preference if mentioned.',
        },
        notes: {
          type: Type.STRING,
          description: 'Agenda or booking notes.',
        },
        createMeetLink: {
          type: Type.BOOLEAN,
          description: 'Whether to attach a Google Meet link.',
        },
      },
      required: ['summary', 'startIso', 'endIso'],
    },
  },
  {
    name: 'propose_reschedule',
    description:
      'Submits a structured reschedule/update intent for an existing Google Calendar event for explicit user confirmation.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: {
          type: Type.STRING,
          description: 'Google Calendar event ID from list_upcoming_bookings.',
        },
        newSummary: {
          type: Type.STRING,
          description: 'Updated or existing event title.',
        },
        newStartIso: {
          type: Type.STRING,
          description: 'New ISO 8601 start time with timezone offset.',
        },
        newEndIso: {
          type: Type.STRING,
          description: 'New ISO 8601 end time with timezone offset.',
        },
        reason: {
          type: Type.STRING,
          description: 'Brief reason for rescheduling.',
        },
      },
      required: ['eventId', 'newSummary', 'newStartIso', 'newEndIso'],
    },
  },
  {
    name: 'propose_cancellation',
    description:
      'Submits a cancellation/deletion intent for an existing Google Calendar event for explicit user confirmation.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: {
          type: Type.STRING,
          description: 'Google Calendar event ID from list_upcoming_bookings.',
        },
        summary: {
          type: Type.STRING,
          description: 'Title of the event to cancel.',
        },
        reason: {
          type: Type.STRING,
          description: 'Brief reason for cancelling.',
        },
      },
      required: ['eventId', 'summary'],
    },
  },
];

interface LiveSessionContext {
  accessToken: string;
  calendarId: string;
  timeZone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  defaultDurationMinutes: number;
  businessName: string;
  conciergeInstructions: string;
  userName?: string;
  userEmail?: string;
}

function buildSystemInstruction(ctx: LiveSessionContext): string {
  const now = new Date();
  const localNowStr = new Intl.DateTimeFormat('en-US', {
    timeZone: ctx.timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);

  return [
    `You are the real-time voice scheduling concierge for ${ctx.businessName || 'VoxCal'}.`,
    `Current date and time in user's timezone (${ctx.timeZone}): ${localNowStr} (ISO reference: ${now.toISOString()}).`,
    `Active Google Calendar ID: ${ctx.calendarId}.`,
    `Host details: ${ctx.userName || 'Account Owner'} (${ctx.userEmail || 'authenticated user'}).`,
    `Preferred working hours: ${ctx.workingHoursStart} to ${ctx.workingHoursEnd} (${ctx.timeZone}).`,
    `Default meeting duration if client doesn't specify one: ${ctx.defaultDurationMinutes} minutes.`,
    ctx.conciergeInstructions ? `Additional studio instructions: ${ctx.conciergeInstructions}` : '',
    '',
    'CORE WORKFLOW RULES:',
    '1. Speak naturally, warmly, and concisely — keep spoken responses crisp (1-3 short sentences) so voice conversations feel effortless.',
    '2. When a client or user wants to book a meeting, check availability FIRST by calling `check_availability` for that date/time window. Never guess availability.',
    '3. If the requested slot has a conflict, inform the caller of the conflict and suggest 2 nearby open slots based on the tool response.',
    '4. When the client wants to reschedule or cancel an existing meeting, call `list_upcoming_bookings` first to find the exact `eventId` and current details.',
    '5. Once you have the booking details (title/purpose, start time, end time, and optional client name/email/notes), call `propose_booking` (or `propose_reschedule` / `propose_cancellation`). Tell the user you have prepared the calendar action on screen for their final confirmation.',
    '6. Always output full ISO-8601 timestamps with the correct UTC offset for the user timezone (or Z if UTC) in tool calls.',
    '7. Never fabricate calendar events, confirmations, or Meet links.',
  ]
    .filter(Boolean)
    .join('\n');
}

function safeWsSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];
    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let sessionCtx: LiveSessionContext | null = null;
    let isClosing = false;

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close error
      }
      liveSession = null;
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    clientWs.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'updateContext' && sessionCtx) {
        sessionCtx = { ...sessionCtx, ...msg.context };
        return;
      }

      if (msg.type === 'start') {
        if (!process.env.GEMINI_API_KEY) {
          safeWsSend(clientWs, {
            type: 'error',
            message:
              'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
          });
          return;
        }

        sessionCtx = {
          accessToken: msg.accessToken || '',
          calendarId: msg.calendarId || 'primary',
          timeZone: msg.timeZone || 'UTC',
          workingHoursStart: msg.workingHoursStart || '09:00',
          workingHoursEnd: msg.workingHoursEnd || '17:00',
          defaultDurationMinutes: Number(msg.defaultDurationMinutes || 30),
          businessName: msg.businessName || 'VoxCal Scheduling',
          conciergeInstructions: msg.conciergeInstructions || '',
          userName: msg.userName,
          userEmail: msg.userEmail,
        };

        const voiceName = msg.voiceName || 'Zephyr';

        try {
          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live-extended-thinking',
            config: {
              responseModalities: [Modality.AUDIO],
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: calendarToolDeclarations }],
              systemInstruction: buildSystemInstruction(sessionCtx),
            },
            callbacks: {
              onopen: () => {
                safeWsSend(clientWs, { type: 'ready' });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;

                if (content?.inputTranscription?.text) {
                  safeWsSend(clientWs, {
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  });
                }

                if (content?.outputTranscription?.text) {
                  safeWsSend(clientWs, {
                    type: 'outputTranscript',
                    text: content.outputTranscription.text,
                  });
                }

                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeWsSend(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }

                if (content?.interrupted) {
                  safeWsSend(clientWs, { type: 'interrupted' });
                }

                if (content?.interactionStatus) {
                  safeWsSend(clientWs, {
                    type: 'interactionStatus',
                    status: content.interactionStatus,
                  });
                }

                if (content?.turnComplete) {
                  safeWsSend(clientWs, { type: 'turnComplete' });
                }

                const calls = message.toolCall?.functionCalls ?? [];
                if (calls.length > 0 && liveSession && sessionCtx) {
                  const activeSession = liveSession;
                  const activeCtx = sessionCtx;

                  void (async () => {
                    for (const call of calls) {
                      const args = (call.args || {}) as Record<string, any>;
                      let toolResponse: Record<string, any> = {};

                      try {
                        if (call.name === 'check_availability') {
                          if (!activeCtx.accessToken) {
                            toolResponse = {
                              error:
                                'User is not authenticated with Google Calendar yet.',
                            };
                          } else {
                            const startIso = String(args.startIso);
                            const endIso = String(args.endIso);

                            const [fbResult, evResult] = await Promise.all([
                              googleCalendarFetch(
                                'https://www.googleapis.com/calendar/v3/freeBusy',
                                activeCtx.accessToken,
                                {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    timeMin: startIso,
                                    timeMax: endIso,
                                    timeZone: activeCtx.timeZone,
                                    items: [{ id: activeCtx.calendarId }],
                                  }),
                                }
                              ),
                              googleCalendarFetch(
                                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(activeCtx.calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(startIso)}&timeMax=${encodeURIComponent(endIso)}`,
                                activeCtx.accessToken
                              ),
                            ]);

                            if (!fbResult.ok) {
                              toolResponse = {
                                error:
                                  fbResult.data?.error?.message ||
                                  'Failed to query Google Calendar free/busy.',
                              };
                            } else {
                              const busy =
                                fbResult.data?.calendars?.[activeCtx.calendarId]
                                  ?.busy || [];
                              const events = (evResult.data?.items || []).map(
                                (ev: any) => ({
                                  id: ev.id,
                                  summary: ev.summary || '(Untitled event)',
                                  start: ev.start?.dateTime || ev.start?.date,
                                  end: ev.end?.dateTime || ev.end?.date,
                                })
                              );

                              toolResponse = {
                                calendarId: activeCtx.calendarId,
                                timeZone: activeCtx.timeZone,
                                workingHours: `${activeCtx.workingHoursStart} - ${activeCtx.workingHoursEnd}`,
                                checkedRange: { startIso, endIso },
                                busyIntervals: busy,
                                existingEvents: events,
                                isCompletelyFree: busy.length === 0,
                              };
                            }
                          }
                        } else if (call.name === 'list_upcoming_bookings') {
                          if (!activeCtx.accessToken) {
                            toolResponse = {
                              error:
                                'User is not authenticated with Google Calendar yet.',
                            };
                          } else {
                            const qs = new URLSearchParams({
                              singleEvents: 'true',
                              orderBy: 'startTime',
                              maxResults: '25',
                              timeMin: String(args.timeMin),
                              timeMax: String(args.timeMax),
                            });
                            if (args.query) qs.set('q', String(args.query));

                            const evResult = await googleCalendarFetch(
                              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(activeCtx.calendarId)}/events?${qs.toString()}`,
                              activeCtx.accessToken
                            );

                            if (!evResult.ok) {
                              toolResponse = {
                                error:
                                  evResult.data?.error?.message ||
                                  'Failed to list Google Calendar bookings.',
                              };
                            } else {
                              const events = (evResult.data?.items || []).map(
                                (ev: any) => ({
                                  id: ev.id,
                                  summary: ev.summary || '(Untitled event)',
                                  start: ev.start?.dateTime || ev.start?.date,
                                  end: ev.end?.dateTime || ev.end?.date,
                                  attendees: (ev.attendees || []).map(
                                    (a: any) => a.email
                                  ),
                                  location: ev.location || '',
                                })
                              );
                              toolResponse = { events, count: events.length };
                            }
                          }
                        } else if (call.name === 'propose_booking') {
                          const proposal = {
                            id: crypto.randomUUID(),
                            action: 'create',
                            calendarId: activeCtx.calendarId,
                            summary: String(args.summary || 'Client Meeting'),
                            startIso: String(args.startIso),
                            endIso: String(args.endIso),
                            timeZone: activeCtx.timeZone,
                            clientName: args.clientName
                              ? String(args.clientName)
                              : undefined,
                            clientEmail: args.clientEmail
                              ? String(args.clientEmail)
                              : undefined,
                            location: args.location
                              ? String(args.location)
                              : undefined,
                            description: args.notes
                              ? String(args.notes)
                              : undefined,
                            createMeetLink: Boolean(args.createMeetLink),
                          };

                          safeWsSend(clientWs, { type: 'proposal', proposal });
                          toolResponse = {
                            status: 'awaiting_user_confirmation',
                            message:
                              'Booking proposal displayed in the UI. Ask the user to click Confirm & Sync to Google Calendar.',
                            proposalId: proposal.id,
                          };
                        } else if (call.name === 'propose_reschedule') {
                          let originalEvent: any = undefined;
                          if (activeCtx.accessToken && args.eventId) {
                            const evRes = await googleCalendarFetch(
                              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(activeCtx.calendarId)}/events/${encodeURIComponent(String(args.eventId))}`,
                              activeCtx.accessToken
                            );
                            if (evRes.ok) originalEvent = evRes.data;
                          }

                          const proposal = {
                            id: crypto.randomUUID(),
                            action: 'update',
                            calendarId: activeCtx.calendarId,
                            eventId: String(args.eventId),
                            summary: String(
                              args.newSummary ||
                                originalEvent?.summary ||
                                'Rescheduled Event'
                            ),
                            startIso: String(args.newStartIso),
                            endIso: String(args.newEndIso),
                            timeZone: activeCtx.timeZone,
                            reason: args.reason ? String(args.reason) : undefined,
                            originalEvent,
                          };

                          safeWsSend(clientWs, { type: 'proposal', proposal });
                          toolResponse = {
                            status: 'awaiting_user_confirmation',
                            message:
                              'Reschedule proposal displayed in the UI for user confirmation.',
                            proposalId: proposal.id,
                          };
                        } else if (call.name === 'propose_cancellation') {
                          let originalEvent: any = undefined;
                          if (activeCtx.accessToken && args.eventId) {
                            const evRes = await googleCalendarFetch(
                              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(activeCtx.calendarId)}/events/${encodeURIComponent(String(args.eventId))}`,
                              activeCtx.accessToken
                            );
                            if (evRes.ok) originalEvent = evRes.data;
                          }

                          const proposal = {
                            id: crypto.randomUUID(),
                            action: 'delete',
                            calendarId: activeCtx.calendarId,
                            eventId: String(args.eventId),
                            summary: String(
                              args.summary ||
                                originalEvent?.summary ||
                                'Scheduled Event'
                            ),
                            startIso:
                              originalEvent?.start?.dateTime ||
                              originalEvent?.start?.date ||
                              '',
                            endIso:
                              originalEvent?.end?.dateTime ||
                              originalEvent?.end?.date ||
                              '',
                            timeZone: activeCtx.timeZone,
                            reason: args.reason ? String(args.reason) : undefined,
                            originalEvent,
                          };

                          safeWsSend(clientWs, { type: 'proposal', proposal });
                          toolResponse = {
                            status: 'awaiting_user_confirmation',
                            message:
                              'Cancellation confirmation dialog opened for the user.',
                            proposalId: proposal.id,
                          };
                        } else {
                          toolResponse = { error: `Unknown tool: ${call.name}` };
                        }
                      } catch (err: any) {
                        toolResponse = {
                          error: err?.message || 'Tool execution failed.',
                        };
                      }

                      safeWsSend(clientWs, {
                        type: 'toolEvent',
                        name: call.name,
                        args,
                        result: toolResponse,
                        timestamp: new Date().toISOString(),
                      });

                      try {
                        activeSession.sendToolResponse({
                          functionResponses: [
                            {
                              id: call.id,
                              name: call.name,
                              response: toolResponse,
                              scheduling: FunctionResponseScheduling.WHEN_IDLE,
                            },
                          ],
                        });
                      } catch {
                        // Session may already be closed
                      }
                    }
                  })();
                }
              },
              onerror: (e: any) => {
                safeWsSend(clientWs, {
                  type: 'error',
                  message: e?.message || 'Gemini Live connection error.',
                });
              },
              onclose: () => {
                safeWsSend(clientWs, { type: 'closed' });
              },
            },
          });
        } catch (err: any) {
          safeWsSend(clientWs, {
            type: 'error',
            message: err?.message || 'Failed to start Gemini Live session.',
          });
        }
        return;
      }

      if (!liveSession) return;

      if (msg.type === 'audio' && msg.data) {
        try {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch {
          // Ignore send errors on closing session
        }
      } else if (msg.type === 'audioStreamEnd') {
        try {
          liveSession.sendRealtimeInput({ audioStreamEnd: true });
        } catch {
          // Ignore
        }
      } else if (msg.type === 'text' && msg.text) {
        try {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: String(msg.text) }] }],
            turnComplete: true,
          });
        } catch {
          // Ignore
        }
      } else if (msg.type === 'calendarSynced') {
        try {
          const note = `[System update: The user confirmed and synced "${msg.summary}" (${msg.action}) to Google Calendar.]`;
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: note }] }],
            turnComplete: true,
          });
        } catch {
          // Ignore
        }
      } else if (msg.type === 'stop') {
        cleanup();
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxCal server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
