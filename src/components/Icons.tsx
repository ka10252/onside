// Icons copied from reference/onside-demo.html.

export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="#141414" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const ArrowRight = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M3 9h11M10 4.5L14.5 9 10 13.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M15 9H4M8 4.5L3.5 9 8 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M4 9.4l3 3 7-7.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CrossIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
    <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const DoneDot = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <circle cx="7" cy="7" r="6.5" fill="#2E6A43" />
    <path d="M4.2 7.2l1.9 1.9 3.8-4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BulbIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M6.5 13.5h5M7.2 16h3.6M9 2a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);
