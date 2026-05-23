'use client';

import { Plus, Search } from 'lucide-react';
import { Button, Input } from './ui';
import type { PaginationMeta } from '@/lib/types';

export function PageHeader({
  title,
  subtitle,
  actionLabel = 'Add',
  canAdd,
  onAdd,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  canAdd?: boolean;
  onAdd?: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
      </div>
      {canAdd ? (
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-4">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">{children}</div>;
}

export function Pagination({
  meta,
  loading,
  onPage,
}: {
  meta: PaginationMeta | null;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-neutral-500">
        Page {meta.current_page} of {meta.last_page}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={loading || meta.current_page <= 1} onClick={() => onPage(Math.max(1, meta.current_page - 1))}>
          Previous
        </Button>
        <Button variant="secondary" disabled={loading || meta.current_page >= meta.last_page} onClick={() => onPage(Math.min(meta.last_page, meta.current_page + 1))}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">{label}</div>;
}
