type Props = { className?: string };

export function IconExternal({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.5 3H3.6A1.6 1.6 0 0 0 2 4.6v7.8A1.6 1.6 0 0 0 3.6 14h7.8A1.6 1.6 0 0 0 13 12.4V9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M9.5 2H14v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.6 2.4 7.4 8.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconVideo({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.7 6.1v3.8l3.2-1.9z" fill="currentColor" />
    </svg>
  );
}

export function IconSearch({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.3 10.3 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconFree({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.4 3.2h5.2a1.6 1.6 0 0 1 1.5 1.1l1.5 4.2v3.1a1.4 1.4 0 0 1-1.4 1.4H3.8a1.4 1.4 0 0 1-1.4-1.4V8.5l1.5-4.2a1.6 1.6 0 0 1 1.5-1.1z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M4.6 2.2v2.6M11.4 2.2v2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.6 8.9h2.8M8 7.5v2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconNote({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.2 3.4h9.6v6.4l-3 2.8H3.2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M12.8 9.8h-3v2.8" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
