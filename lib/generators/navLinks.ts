/**
 * The site menu links, on their own so the menu (on every page) does not pull in the generator
 * catalogue and its preset lists.
 */
export interface NavLink { href: string; label: string }

export const MAKE: NavLink[] = [
  { href: "/generators", label: "Generators" },
  { href: "/templates", label: "Templates" },
  { href: "/tools", label: "Free tools" },
  { href: "/home", label: "Free-form Studio" },
];

export const COMMUNITY: NavLink[] = [
  { href: "/gallery", label: "Gallery" },
  { href: "/collections", label: "Collections" },
  { href: "/graphics", label: "Graphics" },
  { href: "/materials", label: "Materials" },
];

export const LEARN: NavLink[] = [
  { href: "/help", label: "Guides" },
  { href: "/learn/kerf", label: "Kerf & fit tools" },
  { href: "/changelog", label: "Changelog" },
  { href: "/developers", label: "For developers" },
];

export const NAV_GROUPS: { id: string; label: string; links: NavLink[] }[] = [
  { id: "make", label: "Make", links: MAKE },
  { id: "community", label: "Community", links: COMMUNITY },
  { id: "learn", label: "Learn", links: LEARN },
];
