import { Text } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Button, Card, Muted, Title } from '@/src/components/UI';
import { useAuth } from '@/src/context/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <Screen>
      <Title>Profile</Title>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>{user?.name}</Text>
        <Muted>{user?.email}</Muted>
        <Button title="Logout" onPress={handleLogout} />
      </Card>
    </Screen>
  );
}
