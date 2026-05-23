'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import type { DashboardSummary } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/resource-shell';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await api.dashboard();
        setSummary(response.data as DashboardSummary);
      } catch (error) {
        toast.error('Load failed', { description: errorMessage(error) });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const stats = [
    { label: 'Products', value: summary?.total_products ?? 0 },
    { label: 'Categories', value: summary?.total_categories ?? 0 },
    { label: 'Total Quantity', value: summary?.total_quantity ?? 0 },
    { label: 'Low Stock Products', value: summary?.low_stock_products ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of the current inventory." />
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
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
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
    </div>
  );
}
