'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { DashboardSummary } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { Button, Modal } from '@/components/ui';
import { useAuth } from '@/context/auth-context';

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await api.dashboard();
      setSummary(response.data as DashboardSummary);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function clearTransactions() {
    setClearing(true);
    try {
      const response = await api.clearDashboardTransactions();
      toast.success(response.message || 'Transactional data cleared');
      setClearOpen(false);
      await load();
    } catch (error) {
      toast.error('Clear failed', { description: errorMessage(error) });
    } finally {
      setClearing(false);
    }
  }

  const stats = [
    { label: 'Products', value: summary?.total_products ?? 0 },
    { label: 'Categories', value: summary?.total_categories ?? 0 },
    { label: 'Total Quantity', value: summary?.total_quantity ?? 0 },
    { label: 'Low Stock Products', value: summary?.low_stock_products ?? 0 },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">Overview of the current inventory.</p>
        </div>
        {hasPermission('general-settings-edit') ? (
          <Button type="button" variant="danger" className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={() => setClearOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Clear Transactions
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="text-3xl font-semibold tracking-tight">{loading ? '-' : stat.value}</div>
            <div className="mt-1 text-sm text-neutral-500">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-base font-semibold">Inventory Snapshot</h2>
          <div className="mt-4 h-72 min-w-0">
            <ResponsiveContainer width="100%" height={288} minWidth={0} minHeight={288}>
              <BarChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: '#f5f5f5' }} />
                <Bar dataKey="value" fill="#0a0a0a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-base font-semibold">Recent Movements</h2>
          <div className="mt-4 grid gap-3">
            {summary?.recent_movements?.length ? (
              summary.recent_movements.slice(0, 8).map((movement) => (
                <div key={movement.id} className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{movement.product?.name ?? 'Product'}</div>
                    <div className="text-xs text-neutral-500">{movement.created_at}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{movement.type === 'in' ? '+' : '-'}{movement.quantity}</div>
                    <div className="text-xs text-neutral-500">{movement.after_quantity} left</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-neutral-500">No recent movements.</div>
            )}
          </div>
        </section>
      </div>

      <Modal title="Clear Transactional Data" open={clearOpen} onOpenChange={setClearOpen}>
        <div className="grid gap-4">
          <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">This is destructive and cannot be undone from the dashboard.</div>
              <p className="mt-1">
                This will clear all sales invoices, sales returns, purchase invoices, purchase returns, expenses,
                payments, stock movements, product stock rows, batches, and adjustments.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-neutral-200 p-4 text-sm text-neutral-700">
            Master data such as products, customers, suppliers, warehouses, categories, users, and settings will remain.
            Product and variant quantities will be reset to zero, and account balances will reset to initial balances.
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={clearing} onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" className="bg-red-600 text-white hover:bg-red-700" disabled={clearing} onClick={() => void clearTransactions()}>
              <Trash2 className="h-4 w-4" />
              {clearing ? 'Clearing...' : 'Yes, clear transaction data'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
