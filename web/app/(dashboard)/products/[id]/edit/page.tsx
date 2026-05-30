import { ProductsPage } from '@/features/products-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductsPage mode="edit" productId={Number(id)} />;
}
