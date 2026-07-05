import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Button, Card, Input, Muted, Title } from '@/src/components/UI';
import { useAuth } from '@/src/context/AuthContext';
import type { Branch } from '@/src/types';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    try {
      setSubmitting(true);
      const branchOptions = await login(email, password, branchId ?? undefined);
      if (branchOptions) {
        setBranches(branchOptions);
        setBranchId(branchOptions[0]?.id ?? null);
        return;
      }
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
        {branches.length ? (
          <Card>
            <Muted>Branch</Muted>
            {branches.map((branch) => (
              <Button
                key={branch.id}
                title={`${branchId === branch.id ? '✓ ' : ''}${branch.company_name ? `${branch.name} - ${branch.company_name}` : branch.name}`}
                onPress={() => setBranchId(branch.id)}
              />
            ))}
          </Card>
        ) : null}
        <Button title={submitting ? 'Signing in...' : branches.length ? 'Continue' : 'Sign in'} onPress={handleLogin} disabled={submitting} />
      </Card>
    </Screen>
  );
}
