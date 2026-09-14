// OpenRouter icon — a simple routing mark (one request fanning out to
// several models). Not OpenRouter's own logo (trademark), just a
// recognisable symbol for the provider in the pickers and labels.

interface OpenRouterIconProps {
  size?: number | string;
  className?: string;
  /** Use the accent color (default) or inherit from currentColor */
  useBrandColor?: boolean;
}

const OPENROUTER_ACCENT_COLOR = '#6E56CF';

export function OpenRouterIcon({ size = '1em', className, useBrandColor = true }: OpenRouterIconProps) {
  const color = useBrandColor ? OPENROUTER_ACCENT_COLOR : 'currentColor';
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12H8" />
      <path d="M8 12c3.5 0 3.5-6.5 7-6.5h3.5" />
      <path d="M8 12h10.5" />
      <path d="M8 12c3.5 0 3.5 6.5 7 6.5h3.5" />
      <path d="M16.5 3.5l2.5 2-2.5 2" />
      <path d="M16.5 10l2.5 2-2.5 2" />
      <path d="M16.5 16.5l2.5 2-2.5 2" />
      <circle cx="8" cy="12" r="1.7" fill={color} stroke="none" />
    </svg>
  );
}
