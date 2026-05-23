import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerActions } from '@react-navigation/native';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useAuth } from '@/src/context/AuthContext';

type DrawerIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function DrawerLayout() {
  const { user, loading, hasPermission, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
  }

  if (!loading && !user) {
    return <Redirect href="/login" />;
  }

  return (
    <Drawer
      drawerContent={(props) => (
        <AppDrawerContent {...props} hasPermission={hasPermission} />
      )}
      screenOptions={({ navigation }) => ({
        headerTitleAlign: 'center',
        headerShown: true,
        headerLeft: () => (
          <Pressable
            accessibilityLabel="Open side menu"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
            style={styles.menuButton}
          >
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </Pressable>
        ),
        headerRight: () => (
          <IconButton
            icon="logout"
            accessibilityLabel="Log out"
            disabled={loggingOut}
            onPress={() => {
              void handleLogout();
            }}
            style={styles.logoutButton}
          />
        ),
      })}
    >
      <Drawer.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          drawerLabel: 'Dashboard',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="brands"
        options={{
          title: 'Brands',
          drawerLabel: 'Brands',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="tag-multiple-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('brands-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="categories"
        options={{
          title: 'Categories',
          drawerLabel: 'Categories',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="shape-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('categories-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="units"
        options={{
          title: 'Units',
          drawerLabel: 'Units',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="scale-balance" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('units-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="taxes"
        options={{
          title: 'Taxes',
          drawerLabel: 'Taxes',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="percent-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('taxes-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="currencies"
        options={{
          title: 'Currencies',
          drawerLabel: 'Currencies',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="currency-usd" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('currencies-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="products"
        options={{
          title: 'Products',
          drawerLabel: 'Products',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('products-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="users"
        options={{
          title: 'Users',
          drawerLabel: 'Users',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-multiple-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('users-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="roles"
        options={{
          title: 'Roles',
          drawerLabel: 'Roles',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-key-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('users-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          title: 'Profile',
          drawerLabel: 'Profile',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Drawer>
  );
}

function AppDrawerContent({
  state,
  navigation,
  hasPermission,
}: DrawerContentComponentProps & {
  hasPermission: (permission: string | string[]) => boolean;
}) {
  const activeRoute = state.routeNames[state.index];
  const settingsRouteNames = ['roles', 'brands', 'units', 'taxes', 'currencies', 'categories'];
  const [settingsExpanded, setSettingsExpanded] = useState(
    settingsRouteNames.includes(activeRoute)
  );

  function item(name: string, label: string, icon: DrawerIconName, visible = true) {
    if (!visible) return null;

    return (
      <DrawerItem
        key={name}
        label={label}
        focused={activeRoute === name}
        icon={({ color, size }) => (
          <MaterialCommunityIcons name={icon} size={size} color={color} />
        )}
        onPress={() => navigation.navigate(name, { refreshKey: Date.now() })}
      />
    );
  }

  const settingsItems = [
    item('roles', 'Roles', 'account-key-outline', hasPermission('users-index')),
    item('brands', 'Brands', 'tag-multiple-outline', hasPermission('brands-index')),
    item('units', 'Units', 'scale-balance', hasPermission('units-index')),
    item('taxes', 'Taxes', 'percent-outline', hasPermission('taxes-index')),
    item('currencies', 'Currencies', 'currency-usd', hasPermission('currencies-index')),
    item('categories', 'Categories', 'shape-outline', hasPermission('categories-index')),
  ].filter(Boolean);

  return (
    <DrawerContentScrollView>
      {item('dashboard', 'Dashboard', 'view-dashboard-outline')}
      {item('products', 'Products', 'package-variant-closed', hasPermission('products-index'))}
      {item('users', 'Users', 'account-multiple-outline', hasPermission('users-index'))}

      {settingsItems.length ? (
        <View style={styles.drawerSection}>
          <DrawerItem
            label={({ color }) => (
              <View style={styles.drawerGroupLabel}>
                <Text style={[styles.drawerGroupLabelText, { color }]}>Settings</Text>
                <MaterialCommunityIcons
                  name={settingsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={color}
                />
              </View>
            )}
            focused={settingsRouteNames.includes(activeRoute)}
            icon={({ color, size }) => (
              <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
            )}
            onPress={() => setSettingsExpanded((current) => !current)}
          />
          {settingsExpanded ? (
            <View style={styles.drawerSubItems}>{settingsItems}</View>
          ) : null}
        </View>
      ) : null}

      {item('profile', 'Profile', 'account-circle-outline')}
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#1f2937',
  },
  logoutButton: {
    marginRight: 8,
  },
  hiddenDrawerItem: {
    display: 'none',
  },
  drawerSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eaecf0',
  },
  drawerSubItems: {
    paddingLeft: 12,
  },
  drawerGroupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerGroupLabelText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
