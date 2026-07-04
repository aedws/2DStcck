import type { NextConfig } from "next";

// GitHub Pages 배포 시 저장소 이름을 basePath로 지정 (예: "/2dstock")
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
