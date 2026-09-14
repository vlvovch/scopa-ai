// Icon for the on-device opponent: a sparkle in the Apple Intelligence
// palette. Deliberately not the Apple logo, which third-party apps may not
// use; the sparkle only evokes the feature's visual language.
import { useId } from 'react';

interface AppleIntelligenceIconProps {
  size?: string | number;
  className?: string;
}

export function AppleIntelligenceIcon({ size = '1em', className }: AppleIntelligenceIconProps) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.125em' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF9F0A" />
          <stop offset="0.35" stopColor="#FF375F" />
          <stop offset="0.7" stopColor="#BF5AF2" />
          <stop offset="1" stopColor="#0A84FF" />
        </linearGradient>
      </defs>
      {/* main four-point sparkle */}
      <path
        d="M11 3.5c.6 4.4 3 6.8 7.5 7.5-4.5.7-6.9 3.1-7.5 7.5-.6-4.4-3-6.8-7.5-7.5 4.5-.7 6.9-3.1 7.5-7.5z"
        fill={`url(#${gradientId})`}
      />
      {/* small companion sparkle */}
      <path
        d="M18.5 14c.3 1.9 1.3 2.9 3.2 3.2-1.9.3-2.9 1.3-3.2 3.2-.3-1.9-1.3-2.9-3.2-3.2 1.9-.3 2.9-1.3 3.2-3.2z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
