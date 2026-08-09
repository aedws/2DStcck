import type { Metadata } from "next";
import { Providers } from "@/components/layout/Providers";
import {
  SERVICE_REBUILD_CUTOFF_MS,
  SERVICE_UPDATE_PATH,
  serviceUpdateHref,
} from "@/lib/serviceShutdown";
import "./globals.css";

export const metadata: Metadata = {
  title: "2DStock — 가상 모의투자",
  description: "가상 시장 환경에서 즐기는 웹 모의투자 게임",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const updateHref = serviceUpdateHref(
    process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  );
  const redirectBeforeHydration = `(() => {
    const cutoff = ${SERVICE_REBUILD_CUTOFF_MS};
    const updatePath = ${JSON.stringify(SERVICE_UPDATE_PATH)};
    const target = ${JSON.stringify(updateHref)};
    const pathname = window.location.pathname.replace(/\\/+$/, "") || "/";
    if (Date.now() >= cutoff && !pathname.endsWith(updatePath)) {
      window.location.replace(target);
    }
  })();`;

  return (
    <html lang="ko">
      <head>
        <meta name="color-scheme" content="dark" />
        {/* 자체 다크 테마가 있으므로 확장 프로그램의 이중 색상 변환을 막는다. */}
        <meta name="darkreader-lock" />
        <script dangerouslySetInnerHTML={{ __html: redirectBeforeHydration }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
