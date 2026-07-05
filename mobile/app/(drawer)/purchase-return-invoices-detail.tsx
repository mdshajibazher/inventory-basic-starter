import { useLocalSearchParams } from 'expo-router';
import { PurchaseInvoicesScreen } from './purchase-invoices';

export default function PurchaseReturnInvoicesDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PurchaseInvoicesScreen mode="details" invoiceId={Number(id)} kind="return" />;
}
