const S = 1.5;
const C = 'round';
const J = 'round';

const icons = {
  camera: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="2" y="6" width="20" height="14" rx="3" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8.5 6L10 3h4l1.5 3" />
    </svg>
  ),
  mic: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  ),
  micOff: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 11.1 5.7" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  ),
  scan: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M4 7V5a2 2 0 0 1 2-2h2" />
      <path d="M16 3h2a2 2 0 0 1 2 2v2" />
      <path d="M20 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 21H6a2 2 0 0 1-2-2v-2" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  check: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  send: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  ),
  image: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  plus: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  refresh: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M21 4v6h-6" />
      <path d="M3 20v-6h6" />
      <path d="M21 10A9 9 0 0 0 6.2 5.4" />
      <path d="M3 14a9 9 0 0 0 14.8 4.6" />
    </svg>
  ),
  clipboard: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
  calendar: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  alertTriangle: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M12 3L2 21h20L12 3z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
    </svg>
  ),
  search: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  ),
  chevronRight: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  chevronDown: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  factory: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M3 21V9l4-3v6l4-3v6l4-3v6" />
      <rect x="17" y="13" width="4" height="8" rx="1" />
      <rect x="6" y="16" width="2" height="2" rx="0.5" />
      <rect x="10" y="16" width="2" height="2" rx="0.5" />
    </svg>
  ),
  scissors: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.6" y2="15.4" />
      <line x1="14.5" y1="14.5" x2="20" y2="20" />
      <line x1="8.6" y1="8.6" x2="12" y2="12" />
    </svg>
  ),
  package: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M3 9l9 5 9-5" />
      <path d="M12 22V14" />
      <path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
    </svg>
  ),
  shoppingCart: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
    </svg>
  ),
  gift: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8V21" />
      <path d="M3 12h18" />
      <path d="M12 8c-1-3-4-5-6.5-5a2.5 2.5 0 0 0 0 5H12z" />
      <path d="M12 8c1-3 4-5 6.5-5a2.5 2.5 0 0 1 0 5H12z" />
    </svg>
  ),
  chart: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  users: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9" />
    </svg>
  ),
  dollarSign: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  messageCircle: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 8-8h.5a8.5 8.5 0 0 1 8.5 8z" />
    </svg>
  ),
  userCheck: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="8.5" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  ),
  key: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="8" cy="15" r="5" />
      <line x1="12" y1="11" x2="22" y2="2" />
      <line x1="18" y1="6" x2="22" y2="2" />
    </svg>
  ),
  userPlus: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="8.5" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="16" y1="11" x2="22" y2="11" />
    </svg>
  ),
  bell: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  cloud: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  ),
  tag: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7" cy="7" r="1" />
    </svg>
  ),
  eye: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  zap: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  home: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M3 12l9-9 9 9" />
      <path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10" />
    </svg>
  ),
  settings: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
    </svg>
  ),
  inbox: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  lock: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  download: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  filter: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <path d="M4 4h16l-6 7v5l-4 2v-7L4 4z" />
    </svg>
  ),
  arrowLeft: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  copy: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  info: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </svg>
  ),
  clock: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  star: (size = 20) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap={C} strokeLinejoin={J}>
      <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />
    </svg>
  ),
};

export default function Icon({ name, size, color, style, className }) {
  const renderFn = icons[name];
  if (!renderFn) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color || 'currentColor', lineHeight: 1, flexShrink: 0, width: size, height: size, ...style }} className={className}>
      {renderFn(size)}
    </span>
  );
}

export { icons };
