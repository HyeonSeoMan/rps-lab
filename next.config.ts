import type { NextConfig } from "next";

// GitHub Pages 정적 배포(Plan 16절, T-D1). basePath는 배포 빌드에서만 환경 변수로 지정한다.
//   일반:      npm run dev / npm run build        → basePath 없음(개발 서버는 `/`에서 열림)
//   배포 빌드: npm run build:pages               → PAGES_BASE_PATH=/rps-lab, out/ 에 정적 파일 생성
const basePath = process.env.PAGES_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
};

export default nextConfig;
