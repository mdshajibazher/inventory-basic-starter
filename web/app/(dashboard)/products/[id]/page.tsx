import { ProductDetailPage } from '@/features/product-detail-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailPage productId={Number(id)} />;
}
