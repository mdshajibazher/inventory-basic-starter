import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

type ResourceImageKind = 'brand' | 'branch' | 'category' | 'supplier';

export function ResourceImage({ uri, kind }: { uri?: string | null; kind: ResourceImageKind }) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={styles.placeholder}>
        <MaterialCommunityIcons name={iconName(kind)} size={20} color="#9ca3af" />
      </View>
    );
  }

  return <Image source={{ uri }} style={styles.image} onError={() => setFailed(true)} />;
}

function iconName(kind: ResourceImageKind) {
  if (kind === 'brand') return 'tag-multiple-outline';
  if (kind === 'branch') return 'source-branch';
  if (kind === 'supplier') return 'truck-outline';
  return 'shape-outline';
}

const styles = StyleSheet.create({
  image: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#f2f2f2',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    backgroundColor: '#f9fafb',
  },
});
