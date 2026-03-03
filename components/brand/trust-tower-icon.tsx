import * as React from 'react';

import { cn } from '@/lib/utils';

type TrustTowerIconProps = {
  className?: string;
  decorative?: boolean;
  title?: string;
};

export function TrustTowerIcon({ className, decorative = false, title = 'Trust Tower' }: TrustTowerIconProps) {
  const accessibilityProps = decorative
    ? { 'aria-hidden': true }
    : { role: 'img' as const, 'aria-label': title };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-6 w-6', className)}
      {...accessibilityProps}
    >
      <path
        d="M12 2.5L19 6.3V12c0 4.9-2.9 9.2-7 11.8C7.9 21.2 5 16.9 5 12V6.3L12 2.5Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path
        d="M12 2.5L19 6.3V12c0 4.9-2.9 9.2-7 11.8C7.9 21.2 5 16.9 5 12V6.3L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 19V11h6v8H9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 11V9h2v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 11V9h2v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 11V9h2v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 19v-3a1 1 0 0 1 2 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 13.6v1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
