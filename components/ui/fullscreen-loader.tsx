'use client';

import { cn } from '@/lib/utils';

type FullscreenLoaderProps = {
  title?: string;
  description?: string;
  className?: string;
};

export function FullscreenLoader({
  title = 'Preparing Trust Tower',
  description = 'Checking access and syncing your dashboard...',
  className,
}: FullscreenLoaderProps) {
  return (
    <div className={cn('tt-fullscreen-loader', className)} role="status" aria-live="polite" aria-busy="true">
      <div className="tt-fullscreen-loader__card">
        <div className="tt-fullscreen-loader__ring" aria-hidden="true" />
        <p className="tt-fullscreen-loader__title">{title}</p>
        <p className="tt-fullscreen-loader__description">{description}</p>
      </div>
    </div>
  );
}
