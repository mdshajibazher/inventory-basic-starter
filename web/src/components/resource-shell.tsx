'use client';

import { Plus, Search } from 'lucide-react';
import { Button, Input, Select } from './ui';
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

export function TableWrap({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-neutral-200 bg-white" aria-busy={loading}>
      {children}
      {loading ? <div className="absolute inset-0 z-10 flex min-h-28 items-center justify-center bg-white/75" role="status" aria-label="Loading table data"><span className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-300 border-t-black" /></div> : null}
    </div>
  );
}

export function Pagination({
  meta,
  loading,
  onPage,
  onPerPageChange,
}: {
  meta: PaginationMeta | null;
  loading: boolean;
  onPage: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}) {
  if (!meta) return null;
  const pages = paginationPages(meta.current_page, meta.last_page);

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:w-40">
        <Select
          value={String(meta.per_page)}
          onValueChange={(value) => onPerPageChange(Number(value))}
          disabled={loading}
          options={[10, 15, 20, 50, 100].map((perPage) => ({ value: String(perPage), label: `${perPage} Per Page` }))}
        />
      </div>
      <div className="flex items-center gap-1" aria-label="Pagination">
        <Button type="button" variant="secondary" className="h-7 w-7 px-0" aria-label="Previous page" disabled={loading || meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>
          <span className="text-base leading-none text-black">{'<'}</span>
        </Button>
        {pages.map((page, index) => page === null ? (
          <span key={`ellipsis-${index}`} className="flex h-7 w-7 items-center justify-center text-sm text-neutral-500">...</span>
        ) : (
          <Button
            key={page}
            type="button"
            variant={page === meta.current_page ? 'primary' : 'secondary'}
            className="h-7 w-7 px-0"
            aria-label={`Page ${page}`}
            aria-current={page === meta.current_page ? 'page' : undefined}
            disabled={loading}
            onClick={() => onPage(page)}
          >
            {page}
          </Button>
        ))}
        <Button type="button" variant="secondary" className="h-7 w-7 px-0" aria-label="Next page" disabled={loading || meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>
          <span className="text-base leading-none text-black">{'>'}</span>
        </Button>
      </div>
    </div>
  );
}

function paginationPages(currentPage: number, lastPage: number): Array<number | null> {
  if (lastPage <= 5) return Array.from({ length: lastPage }, (_, index) => index + 1);

  const pages = new Set([1, lastPage, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= lastPage).sort((a, b) => a - b);
  const result: Array<number | null> = [];

  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push(null);
    result.push(page);
  });

  return result;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">{label}</div>;
}
