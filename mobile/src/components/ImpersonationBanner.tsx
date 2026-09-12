import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/context/AuthContext';

export function ImpersonationBanner() {
  const { impersonation, stopImpersonation, sessionBusy } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  if (!impersonation) return null;

  async function stop() {
    if (inFlight.current || sessionBusy) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await stopImpersonation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Try again.';
      setError(message);
      Alert.alert('Could not stop impersonating', message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.banner}>
      <View style={styles.content} accessibilityLabel="Impersonation session">
        <Text style={styles.text} accessibilityLiveRegion="polite">
          Impersonating {impersonation.target.name} ({impersonation.target.email})
        </Text>
        <Text variant="bodySmall" style={styles.text}>Original account: {impersonation.actor.name} ({impersonation.actor.email})</Text>
        <Button mode="outlined" textColor="#78350f" disabled={busy || sessionBusy} loading={busy} onPress={() => void stop()}>
          {busy ? 'Stopping…' : 'Stop impersonating'}
        </Button>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#fef3c7', borderBottomWidth: 1, borderBottomColor: '#fcd34d' },
  content: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  text: { color: '#78350f' },
  error: { color: '#991b1b' },
});
