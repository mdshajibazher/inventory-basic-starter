import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from '@/src/context/AuthContext';
import { blackWhiteTheme } from '@/src/theme';

export default function RootLayout() {
  return (
    <PaperProvider theme={blackWhiteTheme}>
      <AuthProvider>
        <StatusBar style="dark" backgroundColor="#ffffff" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </PaperProvider>
  );
}
