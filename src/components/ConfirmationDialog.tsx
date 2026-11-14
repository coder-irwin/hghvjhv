import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck2, Clock, Mail, MapPin, Trash2, Video, X } from 'lucide-react';
import { PendingBookingProposal } from '../types/booking';
import {
  formatDateTimeLabel,
  localDateTimeInputToIso,
  toLocalDateTimeInputValue,
} from '../lib/audioUtils';

interface ConfirmationDialogProps {
  proposal: PendingBookingProposal | null;
  calendarName: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onConfirm: (updatedProposal: PendingBookingProposal) => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  proposal,
  calendarName,
  isSubmitting,
  errorMessage,
  onConfirm,
  onCancel,
}) => {
  const [summary, setSummary] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [createMeetLink, setCreateMeetLink] = useState(false);

  useEffect(() => {
    if (!proposal) return;
    setSummary(proposal.summary || '');
    setStartInput(toLocalDateTimeInputValue(proposal.startIso));
    setEndInput(toLocalDateTimeInputValue(proposal.endIso));
    setClientName(proposal.clientName || '');
    setClientEmail(proposal.clientEmail || '');
    setLocation(proposal.location || '');
    setDescription(proposal.description || '');
    setCreateMeetLink(Boolean(proposal.createMeetLink));
  }, [proposal]);

  if (!proposal) return null;

  const isDelete = proposal.action === 'delete';
  const isUpdate = proposal.action === 'update';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDelete) {
      onConfirm(proposal);
      return;
    }

    onConfirm({
      ...proposal,
      summary: summary.trim() || proposal.summary,
      startIso: startInput ? localDateTimeInputToIso(startInput) : proposal.startIso,
      endIso: endInput ? localDateTimeInputToIso(endInput) : proposal.endIso,
      clientName: clientName.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      createMeetLink,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-booking-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                isDelete
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-blue-200 bg-blue-50 text-blue-600'
              }`}
            >
              {isDelete ? <Trash2 className="h-4 w-4" /> : <CalendarCheck2 className="h-4 w-4" />}
            </div>
            <div>
              <h2
                id="confirm-booking-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                {isDelete
                  ? 'Confirm Event Cancellation'
                  : isUpdate
                    ? 'Confirm Reschedule in Google Calendar'
                    : 'Confirm New Calendar Booking'}
              </h2>
              <p className="text-xs text-slate-500">
                Target calendar: <span className="font-medium text-slate-700">{calendarName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {isDelete ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-sm text-red-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium">
                    Are you sure you want to permanently cancel and delete "{proposal.summary}"?
                  </p>
                  <p className="mt-1 text-xs text-red-700">
                    This will remove the event from Google Calendar and cannot be undone.
                  </p>
                </div>
              </div>

              {(proposal.startIso || proposal.originalEvent?.start?.dateTime) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-mono tabular-nums text-slate-800">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span>
                      {formatDateTimeLabel(
                        proposal.startIso || proposal.originalEvent?.start?.dateTime,
                        proposal.timeZone
                      )}
                    </span>
                  </div>
                  {proposal.reason && (
                    <p className="mt-1.5 text-slate-600">Reason: {proposal.reason}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {isUpdate && proposal.originalEvent && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
                  <span className="font-medium">Replacing previous time: </span>
                  <span className="font-mono tabular-nums">
                    {formatDateTimeLabel(
                      proposal.originalEvent.start?.dateTime || proposal.originalEvent.start?.date,
                      proposal.timeZone
                    )}
                  </span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Booking Title
                </label>
                <input
                  type="text"
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  placeholder="Client consultation"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endInput}
                    onChange={(e) => setEndInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  />
                </div>
              </div>

              {!isUpdate && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Client Name
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      Client Email
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                      placeholder="client@company.com"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  placeholder="Google Meet, Phone, or Office Address"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Notes / Agenda
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  placeholder="Optional meeting notes"
                />
              </div>

              {!isUpdate && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={createMeetLink}
                    onChange={(e) => setCreateMeetLink(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <Video className="h-4 w-4 text-slate-500" />
                  <span>Attach Google Meet video conferencing link</span>
                </label>
              )}
            </>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                isDelete
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSubmitting
                ? 'Syncing...'
                : isDelete
                  ? 'Confirm Cancellation'
                  : isUpdate
                    ? 'Confirm Reschedule'
                    : 'Confirm & Sync Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
