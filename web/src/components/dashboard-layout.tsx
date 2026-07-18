'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Barcode,
  Building2,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Percent,
  ReceiptText,
  FileText,
  Ruler,
  Shield,
  Tags,
  UserCircle,
  Users,
  Warehouse,
  PackageSearch,
  MessageSquareText,
  Settings,
  ChartNoAxesCombined,
  ArrowLeftRight,
  X,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import type { Branding } from '@/lib/types';
import { Button } from './ui';
import { clsx } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string | string[];
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Boxes, permission: 'products-index' },
  { href: '/products/print-barcode', label: 'Print Barcode', icon: Barcode, permission: 'products-index' },
  { href: '/product-stocks', label: 'Product Stock', icon: PackageSearch, permission: 'product-stocks-index' },
  { href: '/transfers', label: 'Stock Transfers', icon: ArrowLeftRight, permission: 'transfers-index' },
  { href: '/expenses', label: 'Expenses', icon: ReceiptText, permission: 'expenses-index' },
  { href: '/expense-categories', label: 'Expense Categories', icon: Tags, permission: 'expenses-index' },
  { href: '/reports/profit', label: 'Profit Report', icon: ChartNoAxesCombined, permission: 'reports-profit' },
  { href: '/sales-invoices', label: 'Sales Invoice', icon: ReceiptText, permission: 'sales-add' },
  { href: '/return-invoices', label: 'Sales Return', icon: ReceiptText, permission: 'returns-add' },
  { href: '/purchase-invoices', label: 'Purchase Invoice', icon: ReceiptText, permission: 'purchases-add' },
  { href: '/purchase-return-invoices', label: 'Purchase Return', icon: ReceiptText, permission: 'purchases-add' },
];

const paymentItems: NavItem[] = [
  { href: '/payments/supplier', label: 'Supplier Payments', icon: WalletCards, permission: ['accounts-index', 'purchases-index'] },
  { href: '/payments/customer', label: 'Customer Payments', icon: WalletCards, permission: ['accounts-index', 'sales-index'] },
];

const peopleItems: NavItem[] = [
  { href: '/customers', label: 'Customers', icon: Users, permission: 'customers-index' },
  { href: '/suppliers', label: 'Suppliers', icon: Building2, permission: 'suppliers-index' },
  { href: '/users', label: 'Users', icon: Users, permission: 'users-index' },
];

const settingsItems: NavItem[] = [
  { href: '/general-settings', label: 'General Settings', icon: Settings, permission: 'general-settings-index' },
  { href: '/email-logs', label: 'Email Logs', icon: Mail, permission: 'general-settings-index' },
  { href: '/sms-logs', label: 'SMS Logs', icon: MessageSquareText, permission: 'general-settings-index' },
  { href: '/brands', label: 'Brands', icon: Tags, permission: 'brands-index' },
  { href: '/branches', label: 'Branches', icon: Building2, permission: 'branches-index' },
  { href: '/categories', label: 'Categories', icon: ChevronRight, permission: 'categories-index' },
  { href: '/units', label: 'Units', icon: Ruler, permission: 'units-index' },
  { href: '/taxes', label: 'Taxes', icon: Percent, permission: 'taxes-index' },
  { href: '/currencies', label: 'Currencies', icon: CircleDollarSign, permission: 'currencies-index' },
  { href: '/accounts', label: 'Accounts', icon: CircleDollarSign, permission: 'accounts-index' },
  { href: '/warehouses', label: 'Warehouses', icon: Warehouse, permission: 'warehouses-index' },
  { href: '/roles', label: 'Roles', icon: Shield, permission: 'users-index' },
  { href: '/profile', label: 'Profile', icon: UserCircle },
];

const settingsReportItems: NavItem[] = [
  { href: '/reports/datewise-products', label: 'Datewise Product Report', icon: FileText, permission: 'reports-profit' },
  { href: '/reports/customer-statement', label: 'Customer Statement', icon: FileText, permission: 'reports-profit' },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, hasPermission, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    api.branding()
      .then((response) => {
        if (active) setBranding(response.data);
      })
      .catch(() => {
        if (active) setBranding(null);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const visibleNav = useMemo(
    () => navItems.filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission]
  );
  const visiblePeople = useMemo(
    () => peopleItems.filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission]
  );
  const visiblePayments = useMemo(
    () => paymentItems.filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission]
  );
  const visibleSettings = useMemo(
    () => settingsItems.filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission]
  );
  const visibleSettingsReports = useMemo(
    () => settingsReportItems.filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission]
  );

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-neutral-500">Loading inventory...</div>;
  }

  if (!user) return null;

  const sidebar = (
    <aside className="flex h-full flex-col border-r border-neutral-200 bg-white">
      <div className="flex h-16 items-center border-b border-neutral-200 px-5">
        <Link href="/dashboard" className="flex min-w-0 items-center">
          {branding?.site_logo ? (
            <img src={branding.site_logo} alt={branding.site_title || 'Inventory'} className="max-h-10 max-w-[180px] object-contain" />
          ) : (
            <span className="text-base font-semibold tracking-tight">Inventory</span>
          )}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {renderLinks(visibleNav, pathname, setMobileOpen)}
        {visiblePayments.length ? (
          <div className="pt-3">
            <div className="px-3 pb-1 text-xs font-semibold uppercase text-neutral-400">Payments</div>
            {renderLinks(visiblePayments, pathname, setMobileOpen)}
          </div>
        ) : null}
        {visiblePeople.length ? (
          <div className="pt-3">
            <div className="px-3 pb-1 text-xs font-semibold uppercase text-neutral-400">People</div>
            {renderLinks(visiblePeople, pathname, setMobileOpen)}
          </div>
        ) : null}
        <div className="pt-3">
          <div className="px-3 pb-1 text-xs font-semibold uppercase text-neutral-400">Settings</div>
          {renderLinks(visibleSettings, pathname, setMobileOpen)}
          {visibleSettingsReports.length ? (
            <div className="pt-3">
              <div className="px-3 pb-1 text-xs font-semibold uppercase text-neutral-400">Report</div>
              {renderLinks(visibleSettingsReports, pathname, setMobileOpen)}
            </div>
          ) : null}
        </div>
      </nav>
      <div className="border-t border-neutral-200 p-3">
        <div className="mb-3 truncate px-2 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="truncate text-xs text-neutral-500">{user.email}</div>
        </div>
        <Button variant="secondary" className="w-full justify-start" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <div className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{sidebar}</div>
        </div>
      ) : null}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-8">
          <Button variant="ghost" className="h-9 w-9 px-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="text-sm text-neutral-500">Admin dashboard</div>
            <div className="truncate font-medium">{user.name}</div>
          </div>
          <Button variant="ghost" className="h-9 w-9 px-0 lg:hidden" onClick={() => void logout()} aria-label="Logout">
            <X className="h-5 w-5" />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function renderLinks(
  items: NavItem[],
  pathname: string,
  setMobileOpen: (open: boolean) => void
) {
  return items.map((item) => {
    const active = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition',
          active ? 'bg-black text-white' : 'text-neutral-700 hover:bg-neutral-100 hover:text-black'
        )}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  });
}
