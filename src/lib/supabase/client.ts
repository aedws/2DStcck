import { createBrowserClient } from "@supabase/ssr";

// 공개용(anon) Supabase 설정. env가 있으면 우선하고, 없으면 아래 기본값으로
// 대체한다 → 어떤 호스트(GitHub Pages·Vercel·로컬)에서도 env 설정 없이
// 로그인·랭킹이 항상 동작하며, env 누락 시 createClient가 throw해 앱이
// 통째로 크래시하는 일을 막는다. anon 키는 공개용이라 소스에 포함해도
// 안전하다(RLS로 보호되며 이미 정적 번들에 인라인된다).
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://mhhyolagigidjwecelet.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oaHlvbGFnaWdpZGp3ZWNlbGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzk5NzIsImV4cCI6MjA5ODc1NTk3Mn0.pz-VETSXl2CDBMo7zzN6iwlXzmNuu5_lHqPRMo2CTJQ";

function makeClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 브라우저에서는 반드시 단일 인스턴스를 재사용한다.
// 매 호출마다 새 클라이언트를 만들면 인스턴스마다 토큰 자동갱신 타이머가 돌아
// 리프레시 토큰 회전이 충돌("Already Used")하면서 세션이 무효화(로그아웃)된다.
let browserClient: ReturnType<typeof makeClient> | undefined;

export function createClient() {
  // SSR/정적 프리렌더 시엔 공유 상태가 없으므로 매번 생성 (window 없음)
  if (typeof window === "undefined") return makeClient();
  if (!browserClient) browserClient = makeClient();
  return browserClient;
}
