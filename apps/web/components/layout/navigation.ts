/** The same destinations and labels at every screen size. */
export const PRIMARY_NAVIGATION = [
  { href: "/plan", label: "Plan", icon: "route" },
  { href: "/trips", label: "My trips", icon: "flight_takeoff" },
  { href: "/explore", label: "Explore", icon: "explore" },
  { href: "/guides", label: "Guides", icon: "menu_book" },
] as const;

export const isNavigationActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
