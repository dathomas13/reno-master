/**
 * The one icon set of the app: inline SVG paths, so no icon package and nothing to load
 * offline. Emojis render differently on every Android version, these look the same
 * everywhere and follow the text colour.
 */
export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  diary: 'M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5',
  cube: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12l9-4.5M12 12v9',
  euro: 'M17 6.5A6 6 0 0 0 8 12a6 6 0 0 0 9 5.5M5 10.5h8M5 13.5h8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plan: 'M3 5h18v14H3zM9 5v14M3 12h6M15 5v6M15 11h6',
  task: 'M5 12l4 4 10-10M4 20h16',
  note: 'M5 4h11l4 4v12H5zM16 4v4h4M9 12h6M9 16h6',
  contact: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
  chat: 'M4 4h16v12H8l-4 4z',
  photo: 'M3 7h4l1.5-2h7L17 7h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  receipt: 'M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5zM8.5 8h7M8.5 12h7M8.5 16h4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4.5 12a7.5 7.5 0 0 1 .2-1.6l-2-1.5 2-3.4 2.3 1a7.6 7.6 0 0 1 2.8-1.6L10.2 2h3.6l.4 2.9c1 .3 2 .9 2.8 1.6l2.3-1 2 3.4-2 1.5a7.6 7.6 0 0 1 0 3.2l2 1.5-2 3.4-2.3-1a7.6 7.6 0 0 1-2.8 1.6l-.4 2.9h-3.6l-.4-2.9a7.6 7.6 0 0 1-2.8-1.6l-2.3 1-2-3.4 2-1.5A7.5 7.5 0 0 1 4.5 12z',
  files: 'M4 5h6l2 2h8v12H4zM4 9h16',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  paperclip: 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l7.5-7.5',
  pin: 'M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  warning: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  className?: string;
  /** filled shapes, e.g. a set star or pin */
  filled?: boolean;
  strokeWidth?: number;
}

export function Icon({ name, className = 'w-6 h-6', filled = false, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
