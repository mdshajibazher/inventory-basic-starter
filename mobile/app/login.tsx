import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Button, Card, Input, Muted, Title } from '@/src/components/UI';
import { useAuth } from '@/src/context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password');
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    try {
      setSubmitting(true);
      await login(email, password);
      router.replace('/(drawer)/dashboard');
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <Card>
        <Title>Inventory Login</Title>
        <Muted>Use the seeded demo admin account to test the app.</Muted>
        <Input autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" />
        <Input secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" />
        <Button title={submitting ? 'Signing in...' : 'Sign in'} onPress={handleLogin} disabled={submitting} />
      </Card>
    </Screen>
  );
}
