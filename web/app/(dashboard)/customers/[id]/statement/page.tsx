import { CustomerStatementPage } from '@/features/customer-statement-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerStatementPage customerId={Number(id)} />;
}
