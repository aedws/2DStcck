"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  isServiceRebuildClosed,
  SERVICE_REBUILD_CUTOFF_MS,
  SERVICE_UPDATE_PATH,
  serviceUpdateHref,
} from "@/lib/serviceShutdown";
import { normalizePathname } from "@/lib/navigation/paths";

const MAX_TIMEOUT_MS = 2_147_000_000;

/** 이미 열려 있는 탭도 마감 시각에 즉시 업데이트 안내 화면으로 전환한다. */
export function ServiceShutdownGate() {
  const pathname = usePathname();

  useEffect(() => {
    if (normalizePathname(pathname) === SERVICE_UPDATE_PATH) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const moveToUpdateNotice = () => {
      if (!isServiceRebuildClosed()) {
        scheduleCutoffCheck();
        return;
      }

      const href = serviceUpdateHref(
        process.env.NEXT_PUBLIC_BASE_PATH ?? "",
      );
      window.location.replace(href);
    };

    const scheduleCutoffCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);
      const remaining = SERVICE_REBUILD_CUTOFF_MS - Date.now();
      timeoutId = setTimeout(
        moveToUpdateNotice,
        Math.max(0, Math.min(remaining, MAX_TIMEOUT_MS)),
      );
    };

    const recheckWhenVisible = () => {
      if (document.visibilityState === "visible") moveToUpdateNotice();
    };

    scheduleCutoffCheck();
    window.addEventListener("focus", moveToUpdateNotice);
    window.addEventListener("pageshow", moveToUpdateNotice);
    document.addEventListener("visibilitychange", recheckWhenVisible);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("focus", moveToUpdateNotice);
      window.removeEventListener("pageshow", moveToUpdateNotice);
      document.removeEventListener("visibilitychange", recheckWhenVisible);
    };
  }, [pathname]);

  return null;
}

