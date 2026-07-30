/** 정적 배포의 trailingSlash 유무와 관계없이 같은 화면으로 판정한다. */
export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

export function isTradePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return (
    normalized === "/trade" ||
    normalized.startsWith("/stock/") ||
    normalized.startsWith("/amc/trade")
  );
}

export function isPortfolioPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/portfolio" || normalized.startsWith("/portfolio/");
}
