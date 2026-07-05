'use client';

import { useState } from 'react';
import { Clock3, FilePlus2, PencilLine, Trash2 } from 'lucide-react';
import type { ActivityLog } from '@/lib/types';

const compactChangeLimit = 6;
const compactValueLength = 90;

export function ActivityLogTimeline({ logs = [] }: { logs?: ActivityLog[] }) {
  const sortedLogs = [...logs].sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));

  return (
    <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">Activity log</h2>
          <p className="text-sm text-neutral-500">{sortedLogs.length ? `${sortedLogs.length} recorded event${sortedLogs.length === 1 ? '' : 's'}` : 'No recorded changes yet'}</p>
        </div>
      </div>

      {sortedLogs.length ? (
        <div className="grid gap-3">
          {sortedLogs.map((log) => (
            <ActivityLogEvent key={log.id} log={log} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ActivityLogEvent({ log }: { log: ActivityLog }) {
  const [expanded, setExpanded] = useState(false);
  const changes = log.changes ?? [];
  const hasHiddenChanges = changes.length > compactChangeLimit;
  const hasLongValues = changes.some((change) => formatValue(change.old).length > compactValueLength || formatValue(change.new).length > compactValueLength);
  const canExpand = hasHiddenChanges || hasLongValues;
  const visibleChanges = expanded ? changes : changes.slice(0, compactChangeLimit);

  return (
    <article className="grid gap-3 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
            <ActivityIcon event={log.event} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-neutral-950">{eventTitle(log)}</div>
            <div className="text-sm text-neutral-500">
              {log.causer?.name ?? 'System'}{log.causer?.email ? ` · ${log.causer.email}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-neutral-500">
          <Clock3 className="h-4 w-4" />
          {formatDateTime(log.created_at)}
        </div>
      </div>

      {changes.length ? (
        <>
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
                {visibleChanges.map((change) => (
                  <tr key={change.field} className="border-t border-neutral-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-neutral-800">{fieldLabel(change.field)}</td>
                    <td className="max-w-xs break-words px-3 py-2 text-red-700">{expanded ? formatValue(change.old) : compactValue(change.old)}</td>
                    <td className="max-w-xs break-words px-3 py-2 text-emerald-700">{expanded ? formatValue(change.new) : compactValue(change.new)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canExpand ? (
            <button
              type="button"
              className="justify-self-start rounded-md px-2 py-1 text-sm font-medium text-black hover:bg-neutral-100"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Show less' : `Show more${hasHiddenChanges ? ` (${changes.length - compactChangeLimit} more)` : ''}`}
            </button>
          ) : null}
        </>
      ) : (
        <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">No field-level changes were recorded for this event.</div>
      )}
    </article>
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
