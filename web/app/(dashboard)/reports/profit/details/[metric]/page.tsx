import { ProfitReportDetailPage } from '@/features/profit-report-detail-page';

export default async function ProfitReportDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ start_date?: string; end_date?: string; warehouse_id?: string; search?: string }>;
}) {
  const [{ metric }, query] = await Promise.all([params, searchParams]);

  return (
    <ProfitReportDetailPage
      metric={metric}
      startDate={query.start_date}
      endDate={query.end_date}
      warehouseId={query.warehouse_id}
      search={query.search}
    />
  );
}
