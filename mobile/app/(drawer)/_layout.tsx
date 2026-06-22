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
        drawerActiveBackgroundColor: '#000000',
        drawerActiveTintColor: '#ffffff',
        drawerInactiveTintColor: '#000000',
        drawerStyle: {
          backgroundColor: '#ffffff',
        },
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTintColor: '#000000',
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
        name="general-settings"
        options={{
          title: 'General Settings',
          drawerLabel: 'General Settings',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('general-settings-index') ? undefined : styles.hiddenDrawerItem,
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
        name="branches"
        options={{
          title: 'Branches',
          drawerLabel: 'Branches',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="source-branch" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('branches-index') ? undefined : styles.hiddenDrawerItem,
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
        name="warehouses"
        options={{
          title: 'Warehouses',
          drawerLabel: 'Warehouses',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="warehouse" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('warehouses-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          drawerLabel: 'Accounts',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cash-multiple" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('accounts-index') ? undefined : styles.hiddenDrawerItem,
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
        name="product-stocks"
        options={{
          title: 'Product Stock',
          drawerLabel: 'Product Stock',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('product-stocks-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="profit-report"
        options={{
          title: 'Profit Report',
          drawerLabel: 'Profit Report',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-line" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('reports-profit') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      {['products-create', 'products-edit'].map((name) => (
        <Drawer.Screen
          key={name}
          name={name}
          options={{
            title: 'Products',
            drawerItemStyle: styles.hiddenDrawerItem,
          }}
        />
      ))}
      <Drawer.Screen
        name="sales-invoices"
        options={{
          title: 'Sales Invoice',
          drawerLabel: 'Sales Invoice',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="receipt-text-plus-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('sales-add') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      {['sales-invoices-create', 'sales-invoices-detail', 'sales-invoices-edit'].map((name) => (
        <Drawer.Screen
          key={name}
          name={name}
          options={{
            title: 'Sales Invoice',
            drawerItemStyle: styles.hiddenDrawerItem,
          }}
        />
      ))}
      <Drawer.Screen
        name="return-invoices"
        options={{
          title: 'Return Invoice',
          drawerLabel: 'Return Invoice',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="receipt-text-remove-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('returns-add') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      {['return-invoices-create', 'return-invoices-detail', 'return-invoices-edit'].map((name) => (
        <Drawer.Screen
          key={name}
          name={name}
          options={{
            title: 'Return Invoice',
            drawerItemStyle: styles.hiddenDrawerItem,
          }}
        />
      ))}
      <Drawer.Screen
        name="purchase-invoices"
        options={{
          title: 'Purchase Invoice',
          drawerLabel: 'Purchase Invoice',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="receipt-text-plus-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('purchases-add') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      {['purchase-invoices-create', 'purchase-invoices-detail', 'purchase-invoices-edit'].map((name) => (
        <Drawer.Screen
          key={name}
          name={name}
          options={{
            title: 'Purchase Invoice',
            drawerItemStyle: styles.hiddenDrawerItem,
          }}
        />
      ))}
      <Drawer.Screen
        name="payments"
        options={{
          title: 'Payments',
          drawerLabel: 'Payments',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="wallet-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission(['accounts-index', 'sales-index', 'purchases-index']) ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="customers"
        options={{
          title: 'Customers',
          drawerLabel: 'Customers',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-box-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('customers-index') ? undefined : styles.hiddenDrawerItem,
        }}
      />
      <Drawer.Screen
        name="suppliers"
        options={{
          title: 'Suppliers',
          drawerLabel: 'Suppliers',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="truck-outline" size={size} color={color} />
          ),
          drawerItemStyle: hasPermission('suppliers-index') ? undefined : styles.hiddenDrawerItem,
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
  const peopleRouteNames = ['customers', 'suppliers', 'users'];
  const salesRouteNames = ['sales-invoices', 'return-invoices', 'purchase-invoices', 'payments'];
  const reportRouteNames = ['profit-report'];
  const settingsRouteNames = ['roles', 'brands', 'branches', 'units', 'taxes', 'currencies', 'accounts', 'warehouses', 'categories'];
  const [peopleExpanded, setPeopleExpanded] = useState(
    peopleRouteNames.includes(activeRoute)
  );
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
    item('branches', 'Branches', 'source-branch', hasPermission('branches-index')),
    item('units', 'Units', 'scale-balance', hasPermission('units-index')),
    item('taxes', 'Taxes', 'percent-outline', hasPermission('taxes-index')),
    item('currencies', 'Currencies', 'currency-usd', hasPermission('currencies-index')),
    item('accounts', 'Accounts', 'cash-multiple', hasPermission('accounts-index')),
    item('warehouses', 'Warehouses', 'warehouse', hasPermission('warehouses-index')),
    item('categories', 'Categories', 'shape-outline', hasPermission('categories-index')),
  ].filter(Boolean);

  const peopleItems = [
    item('customers', 'Customers', 'account-box-outline', hasPermission('customers-index')),
    item('suppliers', 'Suppliers', 'truck-outline', hasPermission('suppliers-index')),
    item('users', 'Users', 'account-multiple-outline', hasPermission('users-index')),
  ].filter(Boolean);

  const salesItems = [
    item('sales-invoices', 'Sales Invoice', 'receipt-text-plus-outline', hasPermission('sales-add')),
    item('return-invoices', 'Return Invoice', 'receipt-text-remove-outline', hasPermission('returns-add') || hasPermission('returns-index')),
    item('purchase-invoices', 'Purchase Invoice', 'receipt-text-plus-outline', hasPermission('purchases-add')),
    item('payments', 'Payments', 'wallet-outline', hasPermission(['accounts-index', 'sales-index', 'purchases-index'])),
  ].filter(Boolean);

  const reportItems = [
    item('profit-report', 'Profit Report', 'chart-line', hasPermission('reports-profit')),
  ].filter(Boolean);

  return (
    <DrawerContentScrollView>
      {item('dashboard', 'Dashboard', 'view-dashboard-outline')}
      {item('products', 'Products', 'package-variant-closed', hasPermission('products-index'))}
      {item('product-stocks', 'Product Stock', 'package-variant', hasPermission('product-stocks-index'))}

      {salesItems.length ? (
        <View style={styles.drawerSection}>
          <DrawerItem
            label="Invoices"
            focused={salesRouteNames.includes(activeRoute)}
            icon={({ color, size }) => (
              <MaterialCommunityIcons name="cart-outline" size={size} color={color} />
            )}
            onPress={() => navigation.navigate('sales-invoices', { refreshKey: Date.now() })}
          />
          <View style={styles.drawerSubItems}>{salesItems}</View>
        </View>
      ) : null}

      {reportItems.length ? (
        <View style={styles.drawerSection}>
          <DrawerItem
            label="Reports"
            focused={reportRouteNames.includes(activeRoute)}
            icon={({ color, size }) => (
              <MaterialCommunityIcons name="chart-box-outline" size={size} color={color} />
            )}
            onPress={() => navigation.navigate('profit-report', { refreshKey: Date.now() })}
          />
          <View style={styles.drawerSubItems}>{reportItems}</View>
        </View>
      ) : null}

      {peopleItems.length ? (
        <View style={styles.drawerSection}>
          <DrawerItem
            label={({ color }) => (
              <View style={styles.drawerGroupLabel}>
                <Text style={[styles.drawerGroupLabelText, { color }]}>People</Text>
                <MaterialCommunityIcons
                  name={peopleExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={color}
                />
              </View>
            )}
            focused={peopleRouteNames.includes(activeRoute)}
            icon={({ color, size }) => (
              <MaterialCommunityIcons name="account-group-outline" size={size} color={color} />
            )}
            onPress={() => setPeopleExpanded((current) => !current)}
          />
          {peopleExpanded ? (
            <View style={styles.drawerSubItems}>{peopleItems}</View>
          ) : null}
        </View>
      ) : null}

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
    backgroundColor: '#000000',
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
    borderTopColor: '#e5e5e5',
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
