'use client';

import EpicOnboardingPage from './(dashboard)/integrations/epic/page';

import { AppShell } from '@/components/layout/app-shell';

export default function HomePage() {
  return (
    <AppShell>
      <EpicOnboardingPage />
    </AppShell>
  );
}
