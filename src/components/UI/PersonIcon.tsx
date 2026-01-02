// Person icon for human player

interface PersonIconProps {
  size?: string | number;
  className?: string;
}

export function PersonIcon({ size = '1em', className }: PersonIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Simple person silhouette */}
      <circle cx="8" cy="4" r="3" />
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z" />
    </svg>
  );
}
