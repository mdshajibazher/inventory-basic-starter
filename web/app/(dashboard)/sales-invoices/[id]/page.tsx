import { SalesInvoicesPage } from '@/features/sales-invoices-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalesInvoicesPage mode="details" invoiceId={Number(id)} />;
}
