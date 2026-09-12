import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, RadioButton, Text } from 'react-native-paper';
import { useAuth } from '@/src/context/AuthContext';
import type { Branch, User } from '@/src/types';

export function ImpersonationAction({ target }: { target: User }) {
  const { user, impersonation, startImpersonation, sessionBusy } = useAuth();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  if (!user?.permissions?.includes('super-user') || impersonation) return null;

  const disabled = busy || sessionBusy || user.id === target.id || !target.is_active;

  function close() {
    if (inFlight.current || sessionBusy) return;
    setOpen(false);
    setBranches(null);
    setBranchId('');
  }

  async function start() {
    if (inFlight.current || disabled || (branches !== null && !branchId)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const availableBranches = await startImpersonation(target.id, branchId ? Number(branchId) : undefined);
      if (availableBranches !== null) {
        setBranches(availableBranches);
        setBranchId('');
      } else {
        setOpen(false);
      }
    } catch (error) {
      Alert.alert('Impersonation failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button compact mode="text" disabled={disabled} onPress={() => setOpen(true)}>Impersonate login</Button>
      <Portal>
        <Modal visible={open} onDismiss={close} dismissable={!busy && !sessionBusy} contentContainerStyle={styles.modal}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="titleLarge">Impersonate login</Text>
            <Text variant="bodyMedium">
              Continue as {target.name} ({target.email}) with this user’s permissions and branch access.
              You can return to your account using Stop impersonating.
            </Text>
            {branches !== null ? (
              <View>
                <Text variant="titleMedium">Choose target branch</Text>
                <RadioButton.Group value={branchId} onValueChange={setBranchId}>
                  {branches.map((branch) => (
                    <RadioButton.Item
                      key={branch.id}
                      label={branch.company_name ? `${branch.name} — ${branch.company_name}` : branch.name}
                      value={String(branch.id)}
                      disabled={busy || sessionBusy}
                    />
                  ))}
                </RadioButton.Group>
                {!branches.length ? <Text>No available branches for this user.</Text> : null}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button mode="outlined" disabled={busy || sessionBusy} onPress={close}>Cancel</Button>
              <Button mode="contained" loading={busy} disabled={disabled || (branches !== null && !branchId)} onPress={() => void start()}>
                {busy ? 'Starting…' : 'Impersonate login'}
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  modal: { margin: 18, maxHeight: '88%', borderRadius: 8, backgroundColor: '#ffffff' },
  content: { padding: 18, gap: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
});
