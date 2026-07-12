'use client';

import { useState } from 'react';
import { Clock3, Eye, FilePlus2, PencilLine, Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import type { ActivityLog } from '@/lib/types';

const compactValueLength = 120;

export function ActivityLogTimeline({ logs = [] }: { logs?: ActivityLog[] }) {
  const sortedLogs = [...logs].sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  return (
    <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">Activity log</h2>
          <p className="text-sm text-neutral-500">{sortedLogs.length ? `${sortedLogs.length} recorded event${sortedLogs.length === 1 ? '' : 's'}` : 'No recorded changes yet'}</p>
        </div>
      </div>

      {sortedLogs.length ? (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Changes</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedLogs.map((log) => (
                <ActivityLogRow key={log.id} log={log} onView={() => setSelectedLog(log)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        title={selectedLog ? eventTitle(selectedLog) : 'Activity details'}
        description="Activity log field-level changes"
        open={Boolean(selectedLog)}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        {selectedLog ? (
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600 sm:grid-cols-3">
              <div>
                <div className="text-xs font-medium uppercase text-neutral-500">User</div>
                <div className="mt-1 text-neutral-900">{selectedLog.causer?.name ?? 'System'}</div>
                {selectedLog.causer?.email ? <div className="text-neutral-500">{selectedLog.causer.email}</div> : null}
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-500">Event</div>
                <div className="mt-1 text-neutral-900">{selectedLog.event ? titleCase(selectedLog.event) : 'Changed'}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-500">Date</div>
                <div className="mt-1 text-neutral-900">{formatDateTime(selectedLog.created_at)}</div>
              </div>
            </div>
            <ActivityLogChangesTable log={selectedLog} />
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

function ActivityLogRow({ log, onView }: { log: ActivityLog; onView: () => void }) {
  const changes = log.changes ?? [];

  return (
    <tr className="border-t border-neutral-100 align-middle">
      <td className="px-3 py-3">
        <div className="flex min-w-56 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
            <ActivityIcon event={log.event} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-neutral-950">{eventTitle(log)}</div>
            <div className="text-xs text-neutral-500">{log.event ? titleCase(log.event) : 'Changed'}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="min-w-44">
          <div className="truncate text-neutral-900">{log.causer?.name ?? 'System'}</div>
          {log.causer?.email ? <div className="truncate text-xs text-neutral-500">{log.causer.email}</div> : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-neutral-700">
        {changes.length ? `${changes.length} field${changes.length === 1 ? '' : 's'}` : 'No fields'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-neutral-600">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-4 w-4" />
          {formatDateTime(log.created_at)}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <Button type="button" className="h-7 px-2 text-xs" onClick={onView}>
          <Eye className="h-3.5 w-3.5" />
          Details
        </Button>
      </td>
    </tr>
  );
}

function ActivityLogChangesTable({ log }: { log: ActivityLog }) {
  const changes = log.changes ?? [];

  if (!changes.length) {
    return <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">No field-level changes were recorded for this event.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-3 py-2">Field</th>
            <th className="px-3 py-2">Before</th>
            <th className="px-3 py-2">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.field} className="border-t border-neutral-100 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-neutral-800">{fieldLabel(change.field)}</td>
              <td className="max-w-xs break-words px-3 py-2 text-red-700">{compactValue(change.old)}</td>
              <td className="max-w-xs break-words px-3 py-2 text-emerald-700">{compactValue(change.new)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityIcon({ event }: { event?: string | null }) {
  if (event === 'created') return <FilePlus2 className="h-4 w-4" />;
  if (event === 'deleted') return <Trash2 className="h-4 w-4" />;
  return <PencilLine className="h-4 w-4" />;
}

function eventTitle(log: ActivityLog): string {
  const event = log.event ? titleCase(log.event) : 'Changed';
  return log.description || event;
}

function fieldLabel(field: string): string {
  return titleCase(field.replace(/_id$/, '').replace(/_/g, ' '));
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Blank';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function compactValue(value: unknown): string {
  const formatted = formatValue(value);
  return formatted.length > compactValueLength ? `${formatted.slice(0, compactValueLength)}...` : formatted;
}

function timestamp(value?: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}
