import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { approvalRow, type ApprovalRow, type ApprovalType } from '../lib/dashboard-approvals';
import type { PaginationMeta } from '../types';

export function useDashboardApprovals(type: ApprovalType, refreshKey: number) {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const sequence = useRef(0);
  const currentRows = useRef<ApprovalRow[]>([]);
  const loadInFlight = useRef(false);
  const approvalInFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, []);

  const reload = useCallback(async () => {
    if (!mounted.current) return;
    const request = ++sequence.current;
    loadInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await api.pendingApprovals(type, { page, perPage: 10 });
      if (!mounted.current || request !== sequence.current) return;
      const nextMeta = response.meta ?? null;
      if (nextMeta && page > Math.max(1, nextMeta.last_page)) {
        currentRows.current = [];
        setPage(Math.max(1, nextMeta.last_page));
        return;
      }
      currentRows.current = response.data.map(record => approvalRow(type, record));
      setRows(currentRows.current);
      setMeta(nextMeta);
    } catch (cause) {
      if (!mounted.current || request !== sequence.current) return;
      currentRows.current = [];
      setRows([]);
      setMeta(null);
      setError(cause instanceof Error ? cause.message : 'Could not load pending approvals.');
    } finally {
      if (mounted.current && request === sequence.current) {
        loadInFlight.current = false;
        setLoading(false);
      }
    }
  }, [page, type]);

  useEffect(() => {
    void reload();
    return () => { sequence.current++; };
  }, [reload, refreshKey]);

  const approve = useCallback(async (row: ApprovalRow) => {
    if (!mounted.current) throw new Error('This dashboard session has changed. Please reopen the record.');
    if (approvalInFlight.current) throw new Error('An approval is already in progress.');
    if (loadInFlight.current) throw new Error('The list is refreshing. Please review the record again.');
    const current = currentRows.current.find(candidate => candidate.id === row.id);
    if (!current?.canApprove || Number(current.amount) !== Number(row.amount) || current.reference !== row.reference || current.party !== row.party || current.date !== row.date) {
      throw new Error('This record has changed. Please review it again before approving.');
    }
    if (!row.canApprove) throw new Error('This record is no longer available for approval.');
    approvalInFlight.current = true;
    setApprovingId(row.id);
    const actions = {
      sales: api.approveSalesInvoice,
      returns: api.approveReturnInvoice,
      purchases: api.approvePurchaseInvoice,
      purchase_returns: api.approvePurchaseReturnInvoice,
      payments: api.approvePayment,
    };
    try {
      await actions[type](row.id);
    } finally {
      await reload();
      approvalInFlight.current = false;
      if (mounted.current) setApprovingId(null);
    }
  }, [reload, type]);

  return { rows, meta, page, setPage, loading, error, reload, approvingId, approve };
}
