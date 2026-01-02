// Gemini Icon component - renders a sparkle icon for Google Gemini
// Brand color: Google Blue (#4285F4)

interface GeminiIconProps {
  size?: number | string;
  className?: string;
  /** Use brand color (default) or inherit from currentColor */
  useBrandColor?: boolean;
}

// Gemini/Google brand color (blue)
const GEMINI_BRAND_COLOR = '#4285F4';

export function GeminiIcon({ size = '1em', className, useBrandColor = true }: GeminiIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill={useBrandColor ? GEMINI_BRAND_COLOR : 'currentColor'}
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Four-pointed star/sparkle for Gemini */}
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
    </svg>
  );
}
