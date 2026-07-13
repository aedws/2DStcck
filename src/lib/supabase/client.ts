import { createBrowserClient } from "@supabase/ssr";

// Supabase는 항상 필수(로그인·지갑 저장·랭킹 계정 레이어). env가 없으면
// 클라이언트 생성 시 에러가 나므로 배포·개발 모두 두 값을 반드시 설정한다.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
