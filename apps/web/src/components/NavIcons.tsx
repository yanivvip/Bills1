import type { ReactNode } from 'react';

// Line icons of the bottom tab bar and the header, as drawn in the product manager's design (24px grid, 2px stroke).
function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Svg>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
export const GaugeIcon = () => (
  <Svg>
    <path d="M12 14l4-4" />
    <path d="M3.5 18a9 9 0 1 1 17 0" />
  </Svg>
);
export const ReceiptIcon = () => (
  <Svg>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);
export const BarsIcon = () => (
  <Svg>
    <path d="M5 20V11M12 20V5M19 20v-6" />
  </Svg>
);
export const BuildingIcon = () => (
  <Svg>
    <path d="M4 21V5l8-3 8 3v16" />
    <path d="M9 21v-5h6v5M9 9h.01M15 9h.01" />
  </Svg>
);
export const BellIcon = () => (
  <Svg>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
    <path d="M10 21h4" />
  </Svg>
);
export const ShieldIcon = () => (
  <Svg>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
  </Svg>
);
export const PlusIcon = () => (
  <Svg size={20}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const ChevronIcon = ({ dir = 'start' }: { dir?: 'start' | 'end' }) => (
  <Svg>
    <path d={dir === 'start' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
  </Svg>
);
export const DropIcon = () => (
  <Svg>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
  </Svg>
);
export const BoltIcon = () => (
  <Svg>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Svg>
);
export const CheckIcon = () => (
  <Svg>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const CalendarIcon = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
export const TrendIcon = ({ up = false }: { up?: boolean }) => (
  <Svg>
    <path d={up ? 'M3 17l6-6 4 4 8-8M15 7h6v6' : 'M3 7l6 6 4-4 8 8M15 17h6v-6'} />
  </Svg>
);
export const LinesIcon = () => (
  <Svg>
    <path d="M6 8h12M6 12h12M6 16h8" />
  </Svg>
);
export const CameraIcon = () => (
  <Svg>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
