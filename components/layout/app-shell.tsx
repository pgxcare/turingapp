'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrustTowerIcon } from '@/components/brand/trust-tower-icon';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  match: string[];
  exact?: string[];
};

const navItems: NavItem[] = [
  { href: '/', label: 'Epic Onboarding', match: ['/integrations'], exact: ['/'] },
  { href: '/control-tower', label: 'Control Tower', match: ['/control-tower', '/models', '/drift'] },
  { href: '/demo-mode', label: 'Demo Mode', match: ['/demo-mode'] },
  { href: '/policy', label: 'Policy Engine', match: ['/policy'] },
  { href: '/changes', label: 'Change Control', match: ['/changes'] },
  { href: '/incidents', label: 'Incidents', match: ['/incidents'] },
  { href: '/audit', label: 'Audit Vault', match: ['/audit'] }
];

const breadcrumbTitles: Record<string, string> = {
  'control-tower': 'Control Tower',
  'demo-mode': 'Demo Mode',
  models: 'Models',
  drift: 'Drift',
  policy: 'Policy Engine',
  changes: 'Change Control',
  incidents: 'Incidents',
  audit: 'Audit Vault',
  integrations: 'Integrations',
  epic: 'Epic Onboarding'
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, authDisabled } = useAuth();
  const environment = process.env.NEXT_PUBLIC_ENV || 'Demo';
  const contentWidth = pathname === '/control-tower' ? 'max-w-none' : 'max-w-[1360px]';

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return [{ href: '/', label: 'Epic Onboarding' }];

    return parts.map((part, index) => {
      const href = `/${parts.slice(0, index + 1).join('/')}`;
      const knownTitle = breadcrumbTitles[part];
      const label = knownTitle || (part.length > 16 ? `${part.slice(0, 8)}...${part.slice(-4)}` : part);
      return { href, label };
    });
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user && !authDisabled) {
      router.push('/login');
    }
  }, [authDisabled, loading, router, user]);

  if (!loading && !user && !authDisabled) return null;

  const showBackButton = pathname !== '/' && pathname !== '/integrations/epic' && pathname !== '/control-tower';

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-r border-border bg-white/70 backdrop-blur-md">
        <Link
          href="/"
          aria-label="Go to Epic Onboarding"
          className="group block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm transition group-hover:border-primary/30 group-hover:bg-primary/15">
              <TrustTowerIcon decorative className="h-6 w-6" />
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              <p className="text-xs leading-none uppercase tracking-[0.24em] text-muted-foreground transition-colors group-hover:text-foreground/80">
                Trust Tower
              </p>
              <h1 className="mt-1.5 leading-tight text-xl font-semibold transition-colors group-hover:text-primary">
                AI Safety Layer
              </h1>
            </div>
          </div>
        </Link>
        <nav className="space-y-1 px-3 pb-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm transition',
                (item.exact?.includes(pathname) || item.match.some((pathPrefix) => pathname.startsWith(pathPrefix)))
                  ? 'bg-primary/12 text-primary'
                  : 'text-foreground/80 hover:bg-muted/70'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md md:px-8">
          <div className={cn('mx-auto flex w-full flex-wrap items-center gap-3', contentWidth)}>
            <div className="hidden min-w-[220px] flex-1 items-center gap-1 text-xs text-muted-foreground lg:flex">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="font-medium text-foreground">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <Badge variant="outline">{environment}</Badge>
            <Badge variant="default">{user?.role || 'Role'}</Badge>
            {!authDisabled ? (
              <Button
                variant="ghost"
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
              >
                Sign out
              </Button>
            ) : null}
          </div>
        </header>
        <main className="page-fade flex-1 overflow-y-auto px-4 pt-3 pb-10 md:px-8 md:pb-14">
          <div className={cn('mx-auto w-full space-y-2.5', contentWidth)}>
            {showBackButton ? (
              <Button variant="ghost" size="sm" className="w-fit px-2" onClick={() => router.back()}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
