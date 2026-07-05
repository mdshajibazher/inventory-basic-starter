import { useLocalSearchParams } from 'expo-router';
import { PurchaseInvoicesScreen } from './purchase-invoices';

export default function PurchaseReturnInvoicesEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PurchaseInvoicesScreen mode="edit" invoiceId={Number(id)} kind="return" />;
}
