import { useLocalSearchParams } from 'expo-router';
import { PurchaseInvoicesScreen } from './purchase-invoices';

export default function PurchaseInvoicesEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PurchaseInvoicesScreen mode="edit" invoiceId={Number(id)} />;
}
