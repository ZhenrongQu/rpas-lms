export type HudNavState = {
  home: boolean;
  services: boolean;
  about: boolean;
};

export function getHudNavState({
  locale,
  pathname,
  hash = "",
}: {
  locale: string;
  pathname: string;
  hash?: string;
}): HudNavState {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const homePath = `/${locale}`;
  const isHome = normalizedPathname === homePath;
  const services = isHome && hash === "#tracks";

  return {
    home: isHome && !services,
    services,
    about: normalizedPathname === `${homePath}/about`,
  };
}
