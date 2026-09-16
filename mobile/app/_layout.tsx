import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from '@/src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ImpersonationBanner } from '@/src/components/ImpersonationBanner';
import { blackWhiteTheme } from '@/src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={blackWhiteTheme}>
        <AuthProvider>
          <StatusBar style="dark" />
          <ImpersonationBanner />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
