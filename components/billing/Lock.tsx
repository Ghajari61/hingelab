export function LockIcon({ size = 10 }: { size?: number }) {
  return (
    <svg className="lock-icon" width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-label="Pro feature" role="img">
      <rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
      <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}
