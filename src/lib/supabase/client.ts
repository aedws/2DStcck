import { createBrowserClient } from "@supabase/ssr";

// 공개용(publishable) Supabase 설정을 하드코딩한다. 배포 환경(Vercel·GitHub Pages)에
// 잘못 설정되었거나 다른 프로젝트를 가리키는 env가 있어도, 앱이 항상 올바른 프로젝트에
// 접속하도록 env를 참조하지 않는다. publishable 키는 공개용이라 소스에 포함해도
// 안전하다(RLS로 보호되며 이미 정적 번들에 인라인된다). 시크릿 키는 절대 넣지 않는다.
const SUPABASE_URL = "https://fzkrnzxflfvpmmkeaxlj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wjbouYDV_guTjnZvZN9v-w_sAYeK6zj";

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
