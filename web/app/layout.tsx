import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/auth-context';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inventory Admin',
  description: 'Inventory dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider><ImpersonationBanner />{children}</AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
