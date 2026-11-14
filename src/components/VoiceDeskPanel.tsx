import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
} from 'lucide-react';
import {
  ParsedIntentSnapshot,
  PendingBookingProposal,
  TranscriptEntry,
  VoiceSessionStatus,
} from '../types/booking';
import { formatDateTimeLabel } from '../lib/audioUtils';

interface VoiceDeskPanelProps {
  status: VoiceSessionStatus;
  isMuted: boolean;
  micLevel: number;
  speakerLevel: number;
  errorMessage: string | null;
  transcripts: TranscriptEntry[];
  parsedIntents: ParsedIntentSnapshot[];
  pendingProposal: PendingBookingProposal | null;
  onStartSession: () => void;
  onStopSession: () => void;
  onToggleMute: () => void;
  onSendTextPrompt: (text: string) => void;
  onReviewProposal: (proposal: PendingBookingProposal) => void;
  fullWidth?: boolean;
}

const SAMPLE_PROMPTS = [
  'Check my availability tomorrow afternoon',
  'Book a 30-min client discovery call tomorrow at 2 PM',
  'List my upcoming meetings this week',
];

export const VoiceDeskPanel: React.FC<VoiceDeskPanelProps> = ({
  status,
  isMuted,
  micLevel,
  speakerLevel,
  errorMessage,
  transcripts,
  parsedIntents,
  pendingProposal,
  onStartSession,
  onStopSession,
  onToggleMute,
  onSendTextPrompt,
  onReviewProposal,
  fullWidth = false,
}) => {
  const [textPrompt, setTextPrompt] = useState('');
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const isActive =
    status === 'connecting' ||
    status === 'ready' ||
    status === 'listening' ||
    status === 'thinking' ||
    status === 'speaking';

  const activeEnergy = status === 'speaking' ? speakerLevel : micLevel;

  const statusText: Record<VoiceSessionStatus, string> = {
    disconnected: 'Session idle',
    connecting: 'Connecting to Gemini Live...',
    ready: 'Connected · Ready for voice',
    listening: isMuted ? 'Microphone muted' : 'Listening to audio',
    thinking: 'Parsing intent & checking Google Calendar...',
    speaking: 'Concierge speaking',
    error: 'Connection issue',
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textPrompt.trim();
    if (!trimmed) return;
    onSendTextPrompt(trimmed);
    setTextPrompt('');
  };

  // Real 20-bar spectrum driven by actual WebAudio RMS input/output energy
  const barMultipliers = [
    0.28, 0.42, 0.56, 0.72, 0.88, 0.64, 0.95, 0.78, 0.54, 0.9,
    0.96, 0.68, 0.84, 0.58, 0.76, 0.92, 0.62, 0.48, 0.36, 0.25,
  ];

  return (
    <section
      className={`flex flex-col rounded-xl border border-slate-200 bg-white ${
        fullWidth ? 'min-h-[640px]' : 'h-full min-h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Voice Booking Concierge
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {statusText[status]}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <button
              type="button"
              onClick={onToggleMute}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isMuted
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
          )}

          {isActive ? (
            <button
              type="button"
              onClick={onStopSession}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              <span>End Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartSession}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Start Voice</span>
            </button>
          )}
        </div>
      </div>

      {/* Live WebAudio Energy Bar Strip */}
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Volume2 className="h-4 w-4 text-slate-500" />
            <span>
              {status === 'speaking'
                ? 'Output stream (24 kHz PCM)'
                : isActive
                  ? isMuted
                    ? 'Mic paused'
                    : 'Input stream (16 kHz PCM)'
                  : 'Microphone standby'}
            </span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-slate-500">
            {isActive ? `${Math.round(activeEnergy * 100)}%` : '0%'}
          </span>
        </div>

        <div
          className="mt-2.5 flex h-8 items-center gap-1"
          aria-hidden="true"
        >
          {barMultipliers.map((mult, idx) => {
            const heightPct = isActive
              ? Math.max(12, Math.min(100, Math.round(activeEnergy * mult * 125 + 12)))
              : 14;
            return (
              <div
                key={idx}
                className="flex-1 rounded-sm transition-transform duration-75"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor:
                    status === 'speaking'
                      ? '#2563EB'
                      : isActive && !isMuted
                        ? '#0F172A'
                        : '#CBD5E1',
                }}
              />
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Pending Proposal Banner inside Voice Desk */}
      {pendingProposal && (
        <div className="mx-5 mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-900">
                Ready for Confirmation ·{' '}
                {pendingProposal.action === 'delete'
                  ? 'Cancel Event'
                  : pendingProposal.action === 'update'
                    ? 'Reschedule Event'
                    : 'New Booking'}
              </p>
              <p className="mt-1 truncate text-sm font-medium text-slate-900">
                {pendingProposal.summary}
              </p>
              {pendingProposal.startIso && (
                <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-600">
                  {formatDateTimeLabel(pendingProposal.startIso, pendingProposal.timeZone)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onReviewProposal(pendingProposal)}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>Review</span>
            </button>
          </div>
        </div>
      )}

      {/* Conversation & Intent Pipeline Stream */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {transcripts.length === 0 ? (
          <div className="flex h-full flex-col justify-center py-6 text-center">
            <p className="font-display text-sm font-semibold text-slate-900">
              Live Voice & Intent Pipeline
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
              Click <span className="font-medium text-slate-700">Start Voice</span> to speak with
              your scheduling concierge, or test a client request below.
            </p>

            <div className="mt-5 space-y-2 text-left">
              <p className="text-xs font-medium text-slate-500">Try a client booking prompt:</p>
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => onSendTextPrompt(sample)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
                >
                  <span>"{sample}"</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          transcripts.map((item) => {
            if (item.speaker === 'tool') {
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="font-medium text-slate-700">
                      Calendar Sync · {item.toolName}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums">{item.timestamp}</span>
                  </div>
                  <p className="mt-1 text-slate-600">{item.text}</p>
                </div>
              );
            }

            const isUser = item.speaker === 'user';
            const isSystem = item.speaker === 'system';

            if (isSystem) {
              return (
                <div key={item.id} className="text-center text-[11px] text-slate-500">
                  {item.text}
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span>{isUser ? 'Client / You' : 'Concierge'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{item.timestamp}</span>
                </div>
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Latest Parsed Intents Strip (if any) */}
      {parsedIntents.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Latest intent: {parsedIntents[0].toolName}</span>
            <span className="font-mono tabular-nums">{parsedIntents[0].timestamp}</span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-800">
            {parsedIntents[0].summary}
          </p>
        </div>
      )}

      {/* Text Fallback Input for Gemini Live Session */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-200 px-4 py-3"
      >
        <input
          type="text"
          value={textPrompt}
          onChange={(e) => setTextPrompt(e.target.value)}
          placeholder="Type a booking request or speak into your mic..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!textPrompt.trim()}
          aria-label="Send message to voice concierge"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Send</span>
        </button>
      </form>
    </section>
  );
};
