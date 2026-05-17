import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, ViewStyle } from 'react-native';

export function Screen({
  children,
  contentStyle,
}: PropsWithChildren<{ contentStyle?: ViewStyle }>) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, contentStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  content: {
    padding: 18,
    gap: 14,
  },
});
