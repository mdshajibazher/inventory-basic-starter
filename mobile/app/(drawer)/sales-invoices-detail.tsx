import { useLocalSearchParams } from 'expo-router';
import { SalesInvoicesScreen } from './sales-invoices';

export default function SalesInvoicesDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <SalesInvoicesScreen mode="details" invoiceId={Number(id)} />;
}
