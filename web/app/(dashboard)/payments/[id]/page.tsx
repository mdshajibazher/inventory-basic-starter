import { PaymentDetailPage } from '@/features/payment-detail-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentDetailPage paymentId={Number(id)} />;
}
