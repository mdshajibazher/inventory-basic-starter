import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

export type PickedImage = {
  uri: string;
  name: string;
  mimeType: string;
};

type ImageUploadFieldProps = {
  label: string;
  imageUri?: string | null;
  disabled?: boolean;
  onChange: (image: PickedImage) => void;
  onClear: () => void;
};

function filenameFromUri(uri: string) {
  return uri.split('/').pop() || `image-${Date.now()}.jpg`;
}

export function ImageUploadField({
  label,
  imageUri,
  disabled,
  onChange,
  onClear,
}: ImageUploadFieldProps) {
  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to upload an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    onChange({
      uri: asset.uri,
      name: asset.fileName ?? filenameFromUri(asset.uri),
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }

  return (
    <View style={styles.container}>
      <Text variant="titleSmall">{label}</Text>
      {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}
      <View style={styles.actions}>
        <Button mode="outlined" icon="image" onPress={pickImage} disabled={disabled}>
          {imageUri ? 'Change image' : 'Upload image'}
        </Button>
        {imageUri ? (
          <Button mode="text" icon="close" onPress={onClear} disabled={disabled}>
            Remove
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  preview: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
