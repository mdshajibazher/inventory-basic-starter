import { PurchaseInvoicesPage } from '@/features/purchase-invoices-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchaseInvoicesPage mode="edit" invoiceId={Number(id)} />;
}
