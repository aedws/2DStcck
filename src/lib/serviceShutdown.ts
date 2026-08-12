export const SERVICE_REBUILD_CUTOFF_ISO = "2026-08-10T00:00:00+09:00";
export const SERVICE_REBUILD_CUTOFF_MS = Date.parse(
  SERVICE_REBUILD_CUTOFF_ISO,
);
export const SERVICE_UPDATE_PATH = "/service-update";
export const SERVICE_LOGIN_PATH = "/login";
export const SERVICE_ADMIN_PATH = "/admin";
export const SERVICE_REBUILD_PUBLIC_PATHS = [
  SERVICE_ADMIN_PATH,
] as const;
export const V2_PUBLIC_URL =
  process.env.NEXT_PUBLIC_V2_PUBLIC_URL?.trim() ||
  "https://vstock-v2.vstock-market.workers.dev/";

export function isServiceRebuildClosed(now = Date.now()): boolean {
  return now >= SERVICE_REBUILD_CUTOFF_MS;
}

/** 종료 뒤에도 업데이트 안내, 기존 계정 로그인과 관리자 운영 화면은 접근시킨다. */
export function isServiceRebuildPublicPath(pathname: string): boolean {
  const normalized = (pathname || "/").replace(/\/+$/, "") || "/";
  return SERVICE_REBUILD_PUBLIC_PATHS.some(
    (path) => normalized === path || normalized.endsWith(path),
  );
}

export function serviceUpdateHref(_basePath = ""): string {
  return V2_PUBLIC_URL;
}
