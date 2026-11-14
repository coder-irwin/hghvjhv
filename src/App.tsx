import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Calendar,
  CalendarCheck2,
  Mic,
  PhoneOff,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import {
  AppNavTab,
  BookingPreferences,
  CalendarEvent,
  CalendarViewMode,
  GoogleCalendarItem,
  ParsedIntentSnapshot,
  PendingBookingProposal,
  TranscriptEntry,
  VoiceSessionStatus,
} from './types/booking';
import {
  clearAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/firebaseAuth';
import {
  AuthExpiredError,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendars,
  fetchEvents,
  updateCalendarEvent,
} from './lib/calendarApi';
import {
  calculateRms,
  float32ToPcm16Base64,
  getDayRange,
  getWeekRange,
  pcm16Base64ToFloat32,
} from './lib/audioUtils';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { SidebarNav } from './components/SidebarNav';
import { CalendarTimeline } from './components/CalendarTimeline';
import { VoiceDeskPanel } from './components/VoiceDeskPanel';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { SettingsView } from './components/SettingsView';

const DEFAULT_PREFERENCES: BookingPreferences = {
  voiceName: 'Zephyr',
  workingHoursStart: '09:00',
  workingHoursEnd: '17:00',
  defaultDurationMinutes: 30,
  businessName: 'VoxCal Scheduling',
  conciergeInstructions: '',
};

function nowTimeLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation & View state
  const [activeTab, setActiveTab] = useState<AppNavTab>('schedule');
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Calendar Data state
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Preferences state
  const [preferences, setPreferences] = useState<BookingPreferences>(DEFAULT_PREFERENCES);

  // Confirmation Dialog state (Mandatory before any Google Calendar mutation)
  const [pendingProposal, setPendingProposal] = useState<PendingBookingProposal | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState<boolean>(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Voice AI / Gemini Live state
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionStatus>('disconnected');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [speakerLevel, setSpeakerLevel] = useState<number>(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [parsedIntents, setParsedIntents] = useState<ParsedIntentSnapshot[]>([]);

  // Refs for WebAudio & WebSocket callbacks (prevents stale closures)
  const accessTokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);
  const isMicActiveRef = useRef<boolean>(false);
  const pendingTextQueueRef = useRef<string[]>([]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const activeCalendar = useMemo(() => {
    return (
      calendars.find((c) => c.id === selectedCalendarId) ||
      calendars.find((c) => c.primary) ||
      calendars[0]
    );
  }, [calendars, selectedCalendarId]);

  const activeTimeZone = useMemo(() => {
    return (
      activeCalendar?.timeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC'
    );
  }, [activeCalendar]);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      (maybeUser) => {
        setUser(maybeUser);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAuthExpired = useCallback(() => {
    clearAccessToken();
    setAccessToken(null);
    setNeedsAuth(true);
    setAuthError('Your Google Calendar authorization expired. Sign in again to continue.');
  }, []);

  const loadCalendars = useCallback(
    async (token: string) => {
      try {
        const list = await fetchCalendars(token);
        setCalendars(list);
        const primary = list.find((c) => c.primary) || list[0];
        if (primary) {
          setSelectedCalendarId((prev) =>
            prev === 'primary' || !list.some((c) => c.id === prev) ? primary.id : prev
          );
        }
      } catch (err: any) {
        if (err instanceof AuthExpiredError) {
          handleAuthExpired();
          return;
        }
        setCalendarError(err?.message || 'Unable to load Google Calendars.');
      }
    },
    [handleAuthExpired]
  );

  const loadEvents = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;

    setIsLoadingEvents(true);
    setCalendarError(null);

    try {
      let timeMin: string;
      let timeMax: string;

      if (viewMode === 'week') {
        const range = getWeekRange(selectedDate);
        timeMin = range.timeMin;
        timeMax = range.timeMax;
      } else if (viewMode === 'agenda') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 30);
        end.setHours(23, 59, 59, 999);
        timeMin = start.toISOString();
        timeMax = end.toISOString();
      } else {
        const range = getDayRange(selectedDate);
        timeMin = range.timeMin;
        timeMax = range.timeMax;
      }

      const items = await fetchEvents(token, {
        calendarId: selectedCalendarId || 'primary',
        timeMin,
        timeMax,
      });
      setEvents(items);
    } catch (err: any) {
      if (err instanceof AuthExpiredError) {
        handleAuthExpired();
        return;
      }
      setCalendarError(err?.message || 'Failed to sync Google Calendar events.');
    } finally {
      setIsLoadingEvents(false);
    }
  }, [selectedCalendarId, selectedDate, viewMode, handleAuthExpired]);

  useEffect(() => {
    if (accessToken && !needsAuth) {
      void loadCalendars(accessToken);
    }
  }, [accessToken, needsAuth, loadCalendars]);

  useEffect(() => {
    if (accessToken && !needsAuth) {
      void loadEvents();
    }
  }, [accessToken, needsAuth, loadEvents]);

  // Keep server WebSocket session context synced if calendar/preferences change mid-call
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && accessToken) {
      wsRef.current.send(
        JSON.stringify({
          type: 'updateContext',
          context: {
            accessToken,
            calendarId: selectedCalendarId,
            timeZone: activeTimeZone,
            workingHoursStart: preferences.workingHoursStart,
            workingHoursEnd: preferences.workingHoursEnd,
            defaultDurationMinutes: preferences.defaultDurationMinutes,
            businessName: preferences.businessName,
            conciergeInstructions: preferences.conciergeInstructions,
          },
        })
      );
    }
  }, [accessToken, selectedCalendarId, activeTimeZone, preferences]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in did not complete. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const stopAudioHardware = useCallback(() => {
    isMicActiveRef.current = false;
    setMicLevel(0);
    setSpeakerLevel(0);

    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped source
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      void outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
  }, []);

  const stopVoiceSession = useCallback(() => {
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
        }
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
    stopAudioHardware();
    setVoiceStatus('disconnected');
    setIsMuted(false);
  }, [stopAudioHardware]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  const handleSignOut = async () => {
    stopVoiceSession();
    await logout();
    setUser(null);
    setAccessToken(null);
    setCalendars([]);
    setEvents([]);
    setNeedsAuth(true);
  };

  const appendOrMergeTranscript = useCallback(
    (speaker: 'user' | 'assistant', chunk: string) => {
      const cleaned = chunk;
      if (!cleaned) return;

      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.speaker === speaker && !last.isFinal) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            text: `${last.text}${cleaned}`,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            speaker,
            text: cleaned,
            timestamp: nowTimeLabel(),
            isFinal: false,
          },
        ];
      });
    },
    []
  );

  const finalizeActiveTranscripts = useCallback(() => {
    setTranscripts((prev) =>
      prev.map((item) => (item.isFinal ? item : { ...item, isFinal: true }))
    );
  }, []);

  const playPcm24kChunk = useCallback((base64Audio: string) => {
    let ctx = outputAudioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 24000 });
      outputAudioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = pcm16Base64ToFloat32(base64Audio);
    if (float32.length === 0) return;

    setSpeakerLevel(calculateRms(float32));

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setSpeakerLevel(0);
      }
    };
  }, []);

  const startVoiceSession = useCallback(
    async (options: { withMic: boolean; initialText?: string }) => {
      const token = accessTokenRef.current;
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      // If already connected, just send text if provided
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (options.initialText) {
          wsRef.current.send(JSON.stringify({ type: 'text', text: options.initialText }));
          setTranscripts((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              speaker: 'user',
              text: options.initialText!,
              timestamp: nowTimeLabel(),
              isFinal: true,
            },
          ]);
        }
        return;
      }

      setVoiceError(null);
      setVoiceStatus('connecting');
      if (options.initialText) {
        pendingTextQueueRef.current.push(options.initialText);
      }

      // Prepare 24kHz output context during user gesture
      try {
        if (!outputAudioCtxRef.current) {
          outputAudioCtxRef.current = new AudioContext({ sampleRate: 24000 });
        }
        if (outputAudioCtxRef.current.state === 'suspended') {
          await outputAudioCtxRef.current.resume();
        }
      } catch {
        // Ignore if browser delays audio context until gesture
      }

      if (options.withMic) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          mediaStreamRef.current = stream;

          const inputCtx = new AudioContext({ sampleRate: 16000 });
          inputAudioCtxRef.current = inputCtx;
          if (inputCtx.state === 'suspended') {
            await inputCtx.resume();
          }

          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          source.connect(processor);
          processor.connect(inputCtx.destination);
          isMicActiveRef.current = true;

          processor.onaudioprocess = (event) => {
            if (
              !isMicActiveRef.current ||
              isMutedRef.current ||
              !wsRef.current ||
              wsRef.current.readyState !== WebSocket.OPEN
            ) {
              setMicLevel(0);
              return;
            }
            const channelData = event.inputBuffer.getChannelData(0);
            setMicLevel(calculateRms(channelData));
            const base64 = float32ToPcm16Base64(channelData);
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
          };
        } catch (err: any) {
          setVoiceError(
            err?.message ||
              'Microphone access denied. You can still type client booking requests below.'
          );
          isMicActiveRef.current = false;
        }
      }

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            accessToken: token,
            calendarId: selectedCalendarId || 'primary',
            timeZone: activeTimeZone,
            voiceName: preferences.voiceName,
            workingHoursStart: preferences.workingHoursStart,
            workingHoursEnd: preferences.workingHoursEnd,
            defaultDurationMinutes: preferences.defaultDurationMinutes,
            businessName: preferences.businessName,
            conciergeInstructions: preferences.conciergeInstructions,
            userName: user?.displayName || undefined,
            userEmail: user?.email || undefined,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          setVoiceStatus(isMicActiveRef.current ? 'listening' : 'ready');
          while (pendingTextQueueRef.current.length > 0) {
            const queued = pendingTextQueueRef.current.shift();
            if (queued) {
              ws.send(JSON.stringify({ type: 'text', text: queued }));
              setTranscripts((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  speaker: 'user',
                  text: queued,
                  timestamp: nowTimeLabel(),
                  isFinal: true,
                },
              ]);
            }
          }
        } else if (msg.type === 'audio' && msg.data) {
          setVoiceStatus('speaking');
          playPcm24kChunk(msg.data);
        } else if (msg.type === 'inputTranscript' && msg.text) {
          appendOrMergeTranscript('user', msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          appendOrMergeTranscript('assistant', msg.text);
        } else if (msg.type === 'interrupted') {
          for (const src of activeSourcesRef.current) {
            try {
              src.stop();
            } catch {
              // Ignore
            }
          }
          activeSourcesRef.current.clear();
          nextStartTimeRef.current = 0;
          setSpeakerLevel(0);
          finalizeActiveTranscripts();
          setVoiceStatus(isMicActiveRef.current ? 'listening' : 'ready');
        } else if (msg.type === 'interactionStatus') {
          if (msg.status === 'IN_PROGRESS') {
            setVoiceStatus((prev) => (prev === 'speaking' ? 'speaking' : 'thinking'));
          } else if (msg.status === 'IDLE') {
            finalizeActiveTranscripts();
            setVoiceStatus(isMicActiveRef.current ? 'listening' : 'ready');
          }
        } else if (msg.type === 'turnComplete') {
          finalizeActiveTranscripts();
        } else if (msg.type === 'toolEvent') {
          const resultObj = msg.result || {};
          let summaryText = '';
          if (resultObj.error) {
            summaryText = `Error: ${resultObj.error}`;
          } else if (msg.name === 'check_availability') {
            const busyCount = Array.isArray(resultObj.busyIntervals)
              ? resultObj.busyIntervals.length
              : 0;
            summaryText =
              busyCount === 0
                ? 'Checked Google Calendar: requested window is completely open.'
                : `Checked Google Calendar: found ${busyCount} existing conflict(s).`;
          } else if (msg.name === 'list_upcoming_bookings') {
            summaryText = `Retrieved ${resultObj.count ?? 0} event(s) from Google Calendar.`;
          } else if (
            msg.name === 'propose_booking' ||
            msg.name === 'propose_reschedule' ||
            msg.name === 'propose_cancellation'
          ) {
            summaryText = 'Parsed intent and opened confirmation dialog.';
          } else {
            summaryText = 'Completed calendar check.';
          }

          setTranscripts((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              speaker: 'tool',
              toolName: msg.name,
              text: summaryText,
              timestamp: nowTimeLabel(),
              isFinal: true,
            },
          ]);

          setParsedIntents((prev) => [
            {
              id: crypto.randomUUID(),
              timestamp: nowTimeLabel(),
              toolName: msg.name,
              summary: summaryText,
              details: msg.args || {},
              status: msg.name.startsWith('propose_') ? 'awaiting_confirmation' : 'checked',
            },
            ...prev.slice(0, 9),
          ]);
        } else if (msg.type === 'proposal' && msg.proposal) {
          setProposalError(null);
          setPendingProposal(msg.proposal);
          setIsDialogOpen(true);
        } else if (msg.type === 'error') {
          setVoiceError(msg.message || 'Voice session error.');
          setVoiceStatus('error');
        } else if (msg.type === 'closed') {
          stopAudioHardware();
          setVoiceStatus('disconnected');
        }
      };

      ws.onerror = () => {
        setVoiceError('WebSocket connection to Gemini Live failed.');
        setVoiceStatus('error');
      };

      ws.onclose = () => {
        stopAudioHardware();
        setVoiceStatus((prev) => (prev === 'error' ? 'error' : 'disconnected'));
      };
    },
    [
      selectedCalendarId,
      activeTimeZone,
      preferences,
      user,
      playPcm24kChunk,
      appendOrMergeTranscript,
      finalizeActiveTranscripts,
      stopAudioHardware,
    ]
  );

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'audioStreamEnd' }));
      }
      return next;
    });
  };

  const handleSendTextPrompt = (text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
      setTranscripts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          speaker: 'user',
          text,
          timestamp: nowTimeLabel(),
          isFinal: true,
        },
      ]);
      setVoiceStatus('thinking');
    } else {
      void startVoiceSession({ withMic: false, initialText: text });
    }
  };

  // Manual booking creation -> still goes through explicit confirmation dialog
  const handleManualNewBooking = () => {
    const start = new Date(selectedDate);
    start.setHours(10, 0, 0, 0);
    const end = new Date(
      start.getTime() + preferences.defaultDurationMinutes * 60 * 1000
    );

    setProposalError(null);
    setPendingProposal({
      id: crypto.randomUUID(),
      action: 'create',
      calendarId: selectedCalendarId || 'primary',
      summary: 'Client Consultation',
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      timeZone: activeTimeZone,
      createMeetLink: true,
    });
    setIsDialogOpen(true);
  };

  const handleEditEvent = (ev: CalendarEvent) => {
    const startIso = ev.start?.dateTime || ev.start?.date || new Date().toISOString();
    const endIso = ev.end?.dateTime || ev.end?.date || new Date().toISOString();
    setProposalError(null);
    setPendingProposal({
      id: crypto.randomUUID(),
      action: 'update',
      calendarId: selectedCalendarId || 'primary',
      eventId: ev.id,
      summary: ev.summary || '(Untitled Event)',
      startIso,
      endIso,
      timeZone: activeTimeZone,
      location: ev.location,
      description: ev.description,
      originalEvent: ev,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteEvent = (ev: CalendarEvent) => {
    setProposalError(null);
    setPendingProposal({
      id: crypto.randomUUID(),
      action: 'delete',
      calendarId: selectedCalendarId || 'primary',
      eventId: ev.id,
      summary: ev.summary || '(Untitled Event)',
      startIso: ev.start?.dateTime || ev.start?.date || '',
      endIso: ev.end?.dateTime || ev.end?.date || '',
      timeZone: activeTimeZone,
      originalEvent: ev,
    });
    setIsDialogOpen(true);
  };

  const handleConfirmProposal = async (confirmed: PendingBookingProposal) => {
    const token = accessTokenRef.current;
    if (!token) {
      setNeedsAuth(true);
      setIsDialogOpen(false);
      return;
    }

    setIsSubmittingProposal(true);
    setProposalError(null);

    try {
      if (confirmed.action === 'create') {
        await createCalendarEvent(token, {
          calendarId: confirmed.calendarId || selectedCalendarId || 'primary',
          summary: confirmed.summary,
          startIso: confirmed.startIso,
          endIso: confirmed.endIso,
          timeZone: confirmed.timeZone || activeTimeZone,
          description: confirmed.description,
          location: confirmed.location,
          attendeeEmail: confirmed.clientEmail,
          attendeeName: confirmed.clientName,
          createMeetLink: confirmed.createMeetLink,
        });
      } else if (confirmed.action === 'update' && confirmed.eventId) {
        await updateCalendarEvent(token, confirmed.eventId, {
          calendarId: confirmed.calendarId || selectedCalendarId || 'primary',
          summary: confirmed.summary,
          startIso: confirmed.startIso,
          endIso: confirmed.endIso,
          timeZone: confirmed.timeZone || activeTimeZone,
          description: confirmed.description,
          location: confirmed.location,
        });
      } else if (confirmed.action === 'delete' && confirmed.eventId) {
        await deleteCalendarEvent(
          token,
          confirmed.eventId,
          confirmed.calendarId || selectedCalendarId || 'primary'
        );
      }

      setIsDialogOpen(false);
      setPendingProposal(null);

      // Refresh live calendar view immediately
      await loadEvents();

      // Update intent history & notify Gemini Live session
      const verb =
        confirmed.action === 'delete'
          ? 'Cancelled'
          : confirmed.action === 'update'
            ? 'Rescheduled'
            : 'Booked';

      setTranscripts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          speaker: 'system',
          text: `${verb} "${confirmed.summary}" in Google Calendar.`,
          timestamp: nowTimeLabel(),
          isFinal: true,
        },
      ]);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'calendarSynced',
            action: confirmed.action,
            summary: confirmed.summary,
            startIso: confirmed.startIso,
          })
        );
      }
    } catch (err: any) {
      if (err instanceof AuthExpiredError) {
        setIsDialogOpen(false);
        handleAuthExpired();
        return;
      }
      setProposalError(err?.message || 'Failed to sync change with Google Calendar.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const isVoiceActive =
    voiceStatus === 'connecting' ||
    voiceStatus === 'ready' ||
    voiceStatus === 'listening' ||
    voiceStatus === 'thinking' ||
    voiceStatus === 'speaking';

  const handleTabClick = (tab: AppNavTab) => {
    setActiveTab(tab);
    if (tab === 'bookings') {
      setViewMode('agenda');
    } else if (tab === 'schedule' && viewMode === 'agenda') {
      setViewMode('day');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 single-row zones (Brand wordmark — Nav links — 1 primary CTA) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('schedule');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            VoxCal
          </a>

          {!needsAuth ? (
            <nav
              aria-label="Primary"
              className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex"
            >
              {(
                [
                  ['schedule', 'Schedule'],
                  ['voice', 'Voice Desk'],
                  ['bookings', 'Bookings'],
                  ['settings', 'Settings'],
                ] as Array<[AppNavTab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTabClick(key)}
                  className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === key
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          ) : (
            <div className="hidden md:block" />
          )}

          <div className="shrink-0">
            {needsAuth ? (
              <button
                type="button"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
              </button>
            ) : isVoiceActive ? (
              <button
                type="button"
                onClick={stopVoiceSession}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>End Voice Desk</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startVoiceSession({ withMic: true })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Start Voice Desk</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      {needsAuth ? (
        <main className="mx-auto max-w-[1160px] px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            <div className="flex flex-col justify-center lg:col-span-7">
              <p className="text-xs font-medium text-blue-700">
                Real-Time Voice Scheduling · Google Calendar Sync
              </p>
              <h1
                className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Voice AI booking desk synced directly with your Google Calendar
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                Let clients speak naturally to check open slots, book appointments, or reschedule
                meetings. Gemini Live parses every booking intent in real time and prepares
                structured calendar updates for your explicit approval.
              </p>

              {authError && (
                <div className="mt-5 max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                  {authError}
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <GoogleSignInButton
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                />
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Uses your Google account to read availability and create, update, or cancel events
                only after your confirmation.
              </p>
            </div>

            {/* Mechanism-to-Outcome Preview Card */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Pipeline Architecture
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  End-to-end voice intent parsing and calendar verification
                </p>

                <div className="mt-6 space-y-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                      <Volume2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900">
                        01. Bi-directional Gemini Live Audio
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Streams 16 kHz microphone input and 24 kHz voice responses with live
                        interruption support.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900">
                        02. Real-Time Free/Busy Lookup
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Queries your Google Calendar availability before proposing any slot or
                        reschedule time.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900">
                        03. Explicit Confirmation Gate
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Every booking, reschedule, or cancellation presents a review dialog before
                        writing to Google Calendar.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>Direct Google Calendar v3 sync</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums">16k / 24k PCM</span>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          {/* Mobile Tab Bar */}
          <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 md:hidden">
            {(
              [
                ['schedule', 'Schedule'],
                ['voice', 'Voice Desk'],
                ['bookings', 'Bookings'],
                ['settings', 'Settings'],
              ] as Array<[AppNavTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleTabClick(key)}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-start gap-6 lg:flex-row">
            {user && (
              <SidebarNav
                user={user}
                calendars={calendars}
                selectedCalendarId={selectedCalendarId}
                selectedDate={selectedDate}
                preferences={preferences}
                onSelectCalendar={setSelectedCalendarId}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  if (activeTab !== 'schedule') setActiveTab('schedule');
                }}
                onOpenSettings={() => setActiveTab('settings')}
                onSignOut={handleSignOut}
              />
            )}

            <div className="min-w-0 flex-1 w-full">
              {activeTab === 'schedule' && (
                <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-12">
                  <div className="xl:col-span-7">
                    <CalendarTimeline
                      events={events}
                      selectedDate={selectedDate}
                      viewMode={viewMode}
                      activeCalendar={activeCalendar}
                      searchQuery={searchQuery}
                      isLoading={isLoadingEvents}
                      errorMessage={calendarError}
                      onChangeDate={setSelectedDate}
                      onChangeViewMode={setViewMode}
                      onSearchChange={setSearchQuery}
                      onRefresh={() => void loadEvents()}
                      onNewBooking={handleManualNewBooking}
                      onEditEvent={handleEditEvent}
                      onDeleteEvent={handleDeleteEvent}
                    />
                  </div>
                  <div className="xl:col-span-5">
                    <VoiceDeskPanel
                      status={voiceStatus}
                      isMuted={isMuted}
                      micLevel={micLevel}
                      speakerLevel={speakerLevel}
                      errorMessage={voiceError}
                      transcripts={transcripts}
                      parsedIntents={parsedIntents}
                      pendingProposal={pendingProposal}
                      onStartSession={() => void startVoiceSession({ withMic: true })}
                      onStopSession={stopVoiceSession}
                      onToggleMute={handleToggleMute}
                      onSendTextPrompt={handleSendTextPrompt}
                      onReviewProposal={(p) => {
                        setPendingProposal(p);
                        setIsDialogOpen(true);
                      }}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'voice' && (
                <VoiceDeskPanel
                  fullWidth
                  status={voiceStatus}
                  isMuted={isMuted}
                  micLevel={micLevel}
                  speakerLevel={speakerLevel}
                  errorMessage={voiceError}
                  transcripts={transcripts}
                  parsedIntents={parsedIntents}
                  pendingProposal={pendingProposal}
                  onStartSession={() => void startVoiceSession({ withMic: true })}
                  onStopSession={stopVoiceSession}
                  onToggleMute={handleToggleMute}
                  onSendTextPrompt={handleSendTextPrompt}
                  onReviewProposal={(p) => {
                    setPendingProposal(p);
                    setIsDialogOpen(true);
                  }}
                />
              )}

              {activeTab === 'bookings' && (
                <CalendarTimeline
                  events={events}
                  selectedDate={selectedDate}
                  viewMode={viewMode}
                  activeCalendar={activeCalendar}
                  searchQuery={searchQuery}
                  isLoading={isLoadingEvents}
                  errorMessage={calendarError}
                  onChangeDate={setSelectedDate}
                  onChangeViewMode={setViewMode}
                  onSearchChange={setSearchQuery}
                  onRefresh={() => void loadEvents()}
                  onNewBooking={handleManualNewBooking}
                  onEditEvent={handleEditEvent}
                  onDeleteEvent={handleDeleteEvent}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  preferences={preferences}
                  calendars={calendars}
                  selectedCalendarId={selectedCalendarId}
                  onUpdatePreferences={setPreferences}
                  onSelectCalendar={setSelectedCalendarId}
                  onReauth={handleLogin}
                />
              )}
            </div>
          </div>
        </main>
      )}

      {/* Mandatory Explicit User Confirmation Modal for All Google Calendar Mutations */}
      <ConfirmationDialog
        proposal={isDialogOpen ? pendingProposal : null}
        calendarName={activeCalendar?.summary || 'Primary Calendar'}
        isSubmitting={isSubmittingProposal}
        errorMessage={proposalError}
        onConfirm={(updated) => void handleConfirmProposal(updated)}
        onCancel={() => {
          setIsDialogOpen(false);
          setProposalError(null);
        }}
      />
    </div>
  );
}
