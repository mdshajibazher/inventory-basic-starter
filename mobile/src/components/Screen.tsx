import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({
  children,
  contentStyle,
  safeStyle,
  edges = ['top', 'right', 'bottom', 'left'],
}: PropsWithChildren<{ contentStyle?: ViewStyle; safeStyle?: ViewStyle; edges?: Array<'top' | 'right' | 'bottom' | 'left'> }>) {
  return (
    <SafeAreaView edges={edges} style={[styles.safe, safeStyle]}>
      <ScrollView style={safeStyle} contentContainerStyle={[styles.content, contentStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 18,
    gap: 14,
  },
});
