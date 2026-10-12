import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "map"
  | "trophy"
  | "medal"
  | "flame"
  | "gem"
  | "clock"
  | "book"
  | "target"
  | "chart"
  | "users"
  | "settings"
  | "bell"
  | "chevron"
  | "arrow"
  | "play"
  | "check"
  | "lock"
  | "sparkles"
  | "calendar"
  | "plus"
  | "search"
  | "menu"
  | "close"
  | "database"
  | "shield"
  | "school"
  | "wand"
  | "logout"
  | "mail"
  | "phone"
  | "edit"
  | "trash"
  | "save"
  | "copy";

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M12 13v4M8 21h8M10 17h4"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4"/></>,
    medal: <><circle cx="12" cy="15" r="5"/><path d="m9 10-3-7h4l2 4 2-4h4l-3 7"/><path d="m12 12 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 14.3l2-.3Z"/></>,
    flame: <path d="M13.5 3S14 7 11 9c-2-3-5-3-5-3s1 3-1 6c-2.5 4 .3 9 6 9 5 0 8-3.5 7-8-.7-3.4-4.5-5-4.5-10Z"/>,
    gem: <><path d="m4 8 4-5h8l4 5-8 13Z"/><path d="M4 8h16M8 3l4 5 4-5M12 8v13"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    book: <><path d="M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 2Z"/><path d="M20 5a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 2Z"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    play: <path d="m8 5 11 7-11 7Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8ZM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6Z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/></>,
    school: <><path d="m3 10 9-6 9 6-9 6Z"/><path d="M7 13v5l5 3 5-3v-5M21 10v6"/></>,
    wand: <><path d="m15 4 5 5L8 21l-5-5Z"/><path d="m6 14 5 5M6 3v4M4 5h4M18 15v4M16 17h4"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-5M14 21h5a2 2 0 0 0 2-2"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    phone: <path d="M5 4h3l1.5 4.5L7.5 10a12 12 0 0 0 6.5 6.5L16 14.5 20.5 16V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}

export function LotusLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="lotus-logo" aria-label="Smart Lotus">
      <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M24 6c5 5 7 10 0 17-7-7-5-12 0-17Z" fill="#f43f8f"/>
        <path d="M10 14c8 1 13 4 13 12-9-1-12-5-13-12Z" fill="#fb75ad"/>
        <path d="M38 14c-8 1-13 4-13 12 9-1 12-5 13-12Z" fill="#ec4899"/>
        <path d="M5 25c8-2 14 0 18 8-9 3-15-1-18-8Z" fill="#a855f7"/>
        <path d="M43 25c-8-2-14 0-18 8 9 3 15-1 18-8Z" fill="#8b5cf6"/>
        <path d="M12 37c7 4 17 4 24 0" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      {!compact && <div><strong>Smart Lotus</strong><span>Học vui · Tiến bộ mỗi ngày</span></div>}
    </div>
  );
}

export function LotusMascot({ mood = "happy" }: { mood?: "happy" | "celebrate" }) {
  return (
    <svg className="lotus-mascot" viewBox="0 0 210 190" fill="none" aria-label="Linh vật hoa sen Smart Lotus">
      <ellipse cx="105" cy="176" rx="64" ry="9" fill="#5B21B6" opacity=".12"/>
      <path d="M105 16c24 24 30 49 1 76-29-28-24-52-1-76Z" fill="#F43F8F"/>
      <path d="M48 43c32 5 50 20 50 55-37-5-49-24-50-55Z" fill="#FB75AD"/>
      <path d="M162 43c-32 5-50 20-50 55 37-5 49-24 50-55Z" fill="#EC4899"/>
      <path d="M28 86c30-14 58-7 73 22-34 16-58 4-73-22Z" fill="#A855F7"/>
      <path d="M182 86c-30-14-58-7-73 22 34 16 58 4 73-22Z" fill="#8B5CF6"/>
      <path d="M45 126c32 18 83 18 120 0-14 35-99 40-120 0Z" fill="#6D28D9"/>
      <ellipse cx="82" cy="104" rx="8" ry="10" fill="white"/><ellipse cx="128" cy="104" rx="8" ry="10" fill="white"/>
      <circle cx="84" cy="106" r="4" fill="#36136F"/><circle cx="126" cy="106" r="4" fill="#36136F"/>
      <circle cx="87" cy="103" r="1.5" fill="white"/><circle cx="129" cy="103" r="1.5" fill="white"/>
      {mood === "celebrate" ? <path d="M92 119c8 11 19 11 27 0" stroke="#36136F" strokeWidth="4" strokeLinecap="round"/> : <path d="M96 120c6 5 12 5 18 0" stroke="#36136F" strokeWidth="4" strokeLinecap="round"/>}
      <path d="M51 112c-16-11-22-21-17-31" stroke="#6D28D9" strokeWidth="5" strokeLinecap="round"/>
      <path d="M160 111c17-9 24-19 21-30" stroke="#6D28D9" strokeWidth="5" strokeLinecap="round"/>
      {mood === "celebrate" && <><path d="m27 28 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#FBBF24"/><path d="m181 28 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#FBBF24"/></>}
    </svg>
  );
}
