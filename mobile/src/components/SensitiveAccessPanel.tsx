import { StyleSheet, View } from 'react-native';
import { Checkbox, Text } from 'react-native-paper';
import type { SensitivePermissionCatalog, UserSensitivePermissions } from '@/src/types';

type Props = {
  catalog: SensitivePermissionCatalog;
  selected: string[];
  onToggle: (permission: string) => void;
  inherited?: UserSensitivePermissions['inherited'];
  disabled?: boolean;
};

export function SensitiveAccessPanel({ catalog, selected, onToggle, inherited, disabled = false }: Props) {
  return (
    <View style={styles.panel}>
      <View>
        <Text variant="titleMedium">Sensitive Access</Text>
        <Text variant="bodySmall" style={styles.muted}>
          Manage direct sensitive grants separately from ordinary permissions.
        </Text>
      </View>

      <View style={styles.warningBox}>
        <Text variant="bodySmall">{catalog.warnings.super_user}</Text>
        <Text variant="bodySmall">{catalog.warnings.approval}</Text>
      </View>

      {catalog.data.map((permission) => {
        const inheritedGrant = inherited?.find((grant) => grant.name === permission.name);
        const roleSources = inheritedGrant?.roles
          .map((role) => `${role.name}${role.is_active ? '' : ' (inactive)'}`)
          .join(', ');

        return (
          <View key={permission.name} style={styles.permissionBox}>
            <Checkbox.Item
              label={`${permission.label}\nDirect grant`}
              status={selected.includes(permission.name) ? 'checked' : 'unchecked'}
              onPress={() => onToggle(permission.name)}
              disabled={disabled}
              labelStyle={styles.permissionLabel}
            />
            {roleSources ? (
              <View style={styles.inheritedBox}>
                <Text variant="bodySmall" style={styles.inheritedTitle}>Inherited and locked</Text>
                <Text variant="bodySmall" style={styles.muted}>{roleSources}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function sensitiveAdditionMessage(catalog: SensitivePermissionCatalog, additions: string[]) {
  const labels = additions.map((name) => catalog.data.find((permission) => permission.name === name)?.label ?? name);

  return `You are about to grant the following sensitive access:\n\n${labels.map((label) => `• ${label}`).join('\n')}\n\nThis confirmation records that you acknowledge each added permission.`;
}

const styles = StyleSheet.create({
  panel: {
    gap: 12,
  },
  muted: {
    color: '#666666',
  },
  warningBox: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#f2c46d',
    borderRadius: 8,
    backgroundColor: '#fff8e6',
    padding: 12,
  },
  permissionBox: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  permissionLabel: {
    lineHeight: 20,
  },
  inheritedBox: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    backgroundColor: '#fafafa',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inheritedTitle: {
    color: '#444444',
    fontWeight: '700',
  },
});
