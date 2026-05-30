import { useLocalSearchParams } from 'expo-router';
import ProductsScreen from './products';

export default function ProductsEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ProductsScreen mode="edit" productId={Number(id)} />;
}
