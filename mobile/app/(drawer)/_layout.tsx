import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerActions } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useAuth } from '@/src/context/AuthContext';

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
          drawerItemStyle: hasPermission('brand') ? undefined : styles.hiddenDrawerItem,
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
          drawerItemStyle: hasPermission('category') ? undefined : styles.hiddenDrawerItem,
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
          drawerItemStyle: hasPermission('unit') ? undefined : styles.hiddenDrawerItem,
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
});
