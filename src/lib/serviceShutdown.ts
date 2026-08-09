export const SERVICE_REBUILD_CUTOFF_ISO = "2026-08-10T00:00:00+09:00";
export const SERVICE_REBUILD_CUTOFF_MS = Date.parse(
  SERVICE_REBUILD_CUTOFF_ISO,
);
export const SERVICE_UPDATE_PATH = "/service-update";

export function isServiceRebuildClosed(now = Date.now()): boolean {
  return now >= SERVICE_REBUILD_CUTOFF_MS;
}

export function serviceUpdateHref(basePath = ""): string {
  const normalizedBasePath = basePath.replace(/\/+$/, "");
  return `${normalizedBasePath}${SERVICE_UPDATE_PATH}/`;
}

