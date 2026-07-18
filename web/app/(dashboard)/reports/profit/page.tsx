import { ProfitReportPage } from '@/features/profit-report-page';

export default async function ProfitReportRoute({
  searchParams,
}: {
  searchParams: Promise<{ start_date?: string; end_date?: string; warehouse_id?: string; search?: string }>;
}) {
  const query = await searchParams;

  return (
    <ProfitReportPage
      initialStartDate={query.start_date}
      initialEndDate={query.end_date}
      initialWarehouseId={query.warehouse_id ?? 'all'}
      initialSearch={query.search ?? ''}
    />
  );
}
