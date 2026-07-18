import { TransfersPage } from '@/features/transfers-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransfersPage mode="details" transferId={Number(id)} />;
}
