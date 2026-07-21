import type { Metadata } from "next";
import { Providers } from "@/components/layout/Providers";
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
  return (
    <html lang="ko">
      <head>
        <meta name="color-scheme" content="dark" />
        {/* 자체 다크 테마가 있으므로 확장 프로그램의 이중 색상 변환을 막는다. */}
        <meta name="darkreader-lock" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
