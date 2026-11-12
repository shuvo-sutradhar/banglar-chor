import type { LootId } from '../../game/data/loot';

/** Small original SVG icons for inventory rows (no external assets). */
export function LootIcon({ lootId }: { lootId: LootId }) {
  const common = { width: 40, height: 40, viewBox: '0 0 40 40', 'aria-hidden': true } as const;
  switch (lootId) {
    case 'brass-pot':
      return (
        <svg {...common}>
          <ellipse cx="18" cy="25" rx="11" ry="9" fill="#c9a03c" />
          <rect x="14" y="10" width="8" height="7" fill="#c9a03c" />
          <path d="M28 22 L37 15" stroke="#c9a03c" strokeWidth="3" />
        </svg>
      );
    case 'lantern':
      return (
        <svg {...common}>
          <rect x="12" y="30" width="16" height="4" fill="#2f5a43" />
          <ellipse cx="20" cy="21" rx="7" ry="9" fill="#ffd28a" />
          <path d="M14 8 Q20 2 26 8" stroke="#2f5a43" strokeWidth="2" fill="none" />
        </svg>
      );
    case 'old-radio':
      return (
        <svg {...common}>
          <rect x="5" y="13" width="30" height="20" rx="3" fill="#6b3f22" />
          <circle cx="15" cy="23" r="6" fill="#15110e" />
          <circle cx="28" cy="21" r="2.5" fill="#f0c24a" />
          <path d="M28 13 L34 3" stroke="#888" strokeWidth="1.5" />
        </svg>
      );
    case 'metal-plate':
      return (
        <svg {...common}>
          <ellipse cx="20" cy="22" rx="16" ry="9" fill="#b5833f" />
          <ellipse cx="20" cy="21" rx="11" ry="6" fill="#cf9a52" />
        </svg>
      );
    case 'alarm-clock':
      return (
        <svg {...common}>
          <circle cx="20" cy="22" r="11" fill="#3f6f73" />
          <circle cx="20" cy="22" r="8" fill="#f6f1e8" />
          <path d="M20 22 L20 16 M20 22 L24 24" stroke="#15110e" strokeWidth="1.5" />
          <circle cx="11" cy="10" r="3.5" fill="#c9a03c" />
          <circle cx="29" cy="10" r="3.5" fill="#c9a03c" />
        </svg>
      );
    case 'fake-jewelry':
    case 'actual-jewelry':
      return (
        <svg {...common}>
          <path d="M8 12 Q20 34 32 12" stroke="#f0c24a" strokeWidth="4" fill="none" strokeDasharray="3 2" />
          {lootId === 'actual-jewelry' && <circle cx="20" cy="27" r="4" fill="#c21f3a" />}
        </svg>
      );
    case 'broken-torch':
      return (
        <svg {...common}>
          <rect x="6" y="17" width="22" height="7" rx="2" fill="#2f5a43" />
          <rect x="28" y="15" width="6" height="11" fill="#cfe8f0" />
          <path d="M14 14 L18 27" stroke="#d8583e" strokeWidth="2" />
        </svg>
      );
    case 'dentures':
      return (
        <svg {...common}>
          <rect x="11" y="8" width="18" height="27" rx="3" fill="#cfe8f0" opacity="0.6" />
          <path d="M13 23 Q20 30 27 23 Z" fill="#e58a9a" />
          <path d="M14 23 L26 23" stroke="#fff" strokeWidth="3" strokeDasharray="2 1" />
        </svg>
      );
    case 'chicken':
      return (
        <svg {...common}>
          <ellipse cx="18" cy="25" rx="12" ry="9" fill="#efe7d6" />
          <circle cx="28" cy="14" r="5" fill="#efe7d6" />
          <path d="M27 8 L29 5 L31 8" fill="#d23a2a" />
          <path d="M33 14 L37 15 L33 16 Z" fill="#c9a03c" />
        </svg>
      );
  }
}
