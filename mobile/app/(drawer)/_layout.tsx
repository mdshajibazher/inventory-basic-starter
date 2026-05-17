import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerActions } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useAuth } from '@/src/context/AuthContext';

export default function DrawerLayout() {
  const { user, loading, logout } = useAuth();
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
      <Drawer.Screen name="dashboard" options={{ title: 'Dashboard', drawerLabel: 'Dashboard' }} />
      <Drawer.Screen name="categories" options={{ title: 'Categories', drawerLabel: 'Categories' }} />
      <Drawer.Screen name="products" options={{ title: 'Products', drawerLabel: 'Products' }} />
      <Drawer.Screen name="profile" options={{ title: 'Profile', drawerLabel: 'Profile' }} />
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
});
