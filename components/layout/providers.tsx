'use client';

import { AuthProvider } from '@/lib/auth';
import { GlobalNavigationLoader } from '@/components/layout/global-navigation-loader';
import { ToastProvider } from '@/components/ui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <GlobalNavigationLoader />
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
