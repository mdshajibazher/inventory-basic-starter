import { useLocalSearchParams } from 'expo-router';
import { SalesInvoicesScreen } from './sales-invoices';

export default function ReturnInvoicesDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <SalesInvoicesScreen mode="details" invoiceId={Number(id)} kind="returns" />;
}
