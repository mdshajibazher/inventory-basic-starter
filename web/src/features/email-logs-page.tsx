'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import type { EmailLog, PaginationMeta } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

const perPage = 15;

export function EmailLogsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api.emailLogs({ page: nextPage, perPage, search: debouncedSearch });
      setLogs(response.data);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    if (!hasPermission('general-settings-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [search]);

  return (
    <div>
      <PageHeader title="Email Logs" subtitle={`${logs.length} shown from ${pagination?.total ?? logs.length}`} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search user, email, subject, message, status, provider response" />

      {logs.length ? (
        <TableWrap>
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Provider Response</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-neutral-100 align-top">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{log.user_name ?? '-'}</div>
                    {log.user_email ? <div className="text-xs text-neutral-500">{log.user_email}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{log.email}</td>
                  <td className="px-4 py-3"><StatusPill status={log.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3">{recordLabel(log)}</td>
                  <td className="max-w-xs break-words px-4 py-3 font-medium">{log.subject}</td>
                  <td className="max-w-sm whitespace-pre-wrap px-4 py-3">{log.message}</td>
                  <td className="max-w-xs break-words px-4 py-3 text-neutral-600">{log.provider_response ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          {loading ? 'Loading email logs...' : 'No email logs found.'}
        </div>
      )}

      <Pagination meta={pagination} loading={loading} onPage={setPage} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'submitted'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'skipped'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-rose-50 text-rose-700 ring-rose-200';

  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-medium capitalize ring-1 ${color}`}>
      {status}
    </span>
  );
}

function recordLabel(log: EmailLog) {
  if (!log.record_type && !log.record_id) return '-';

  const type = log.record_type?.replace(/_/g, ' ') ?? 'Record';
  return `${titleCase(type)}${log.record_id ? ` #${log.record_id}` : ''}`;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}
