import { useLocalSearchParams } from 'expo-router';
import { SalesInvoicesScreen } from './sales-invoices';

export default function ReturnInvoicesEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <SalesInvoicesScreen mode="edit" invoiceId={Number(id)} kind="returns" />;
}
