# Cloudflare Pages 배포 가이드 (프론트엔드)

이 앱은 완전 정적 사이트(`next.config.ts`의 `output: "export"` → `out/` 폴더)라,
**Cloudflare Pages 무료 플랜(요청·대역폭 무제한)** 에 그대로 올릴 수 있습니다.
Vercel의 "Edge Request 한도" 같은 제약이 없어집니다.

- **백엔드(Supabase)는 그대로** 둡니다. 프론트만 이사합니다.
- Supabase 설정(URL·공개 anon 키)은 코드에 하드코딩돼 있어 **환경변수 설정이 필요 없습니다.**
- 레포에 이미 준비해 둔 파일: `.node-version`(빌드 Node 고정), `public/_headers`(캐시 정책).

---

## 1. Cloudflare 무료 계정 준비
1. https://dash.cloudflare.com 에서 가입/로그인(무료).

## 2. Pages 프로젝트 생성 (GitHub 연결)
1. 왼쪽 메뉴 **Workers & Pages** → **Create application** → **Pages** 탭 → **Connect to Git**.
   - ⚠️ **반드시 "Pages" 탭**에서 시작하세요. "Workers" 탭(또는 "Import a repository"가
     Workers로 잡히는 경우)으로 들어가면 SSR(Workers+OpenNext) 빌드가 돼서
     이 앱(정적 export)에서는 실패합니다. 아래 4번의 실패 사례 참고.
2. GitHub 계정을 연결하고 이 레포(**aedws/2dstck**)를 선택.
3. Production branch: **main**.

## 3. 빌드 설정 (이 값 그대로 입력)
| 항목 | 값 |
|---|---|
| Framework preset | **None** (Next.js 프리셋을 고르지 마세요 — 아래 ⚠️ 참고) |
| Build command | `npm run build` |
| Build output directory | `out` |
| Deploy command | **(비움)** — 값이 있으면 지우세요 (`npx wrangler deploy` 금지) |
| Root directory | (비움) |
| Environment variables | **없음** (Supabase 설정이 코드에 포함됨) |

- ⚠️ **Framework preset을 "Next.js"로 두지 마세요.** 최근 Cloudflare는 "Next.js" 프리셋을
  고르면 **Workers + OpenNext(SSR) 빌드**로 연결해 `npx wrangler deploy`를 실행합니다.
  이 앱은 `output: "export"`(정적)라 SSR 산출물(`.next/standalone`)이 없어 빌드가
  `ENOENT ... pages-manifest.json`으로 실패합니다. 반드시 **"None"** 을 고르고 위 표대로
  수동 입력하세요.
- Node 버전: 레포의 `.node-version`(22)을 자동 인식합니다. 혹시 빌드가 Node 버전 문제로
  실패하면 환경변수 **`NODE_VERSION` = `22`** 를 추가하세요.

4. **Save and Deploy** 클릭 → 몇 분 뒤 `https://<프로젝트이름>.pages.dev` 주소가 생깁니다.

### ⚠️ 이미 "배포 실패"가 난 경우 (Workers/OpenNext로 잡힘)
빌드 로그에 `npx wrangler deploy`, `@opennextjs/cloudflare`, `open-next.config.ts`,
`.next/standalone/... pages-manifest.json ENOENT` 같은 게 보이면, 프로젝트가
**SSR(Workers) 빌드**로 만들어진 것입니다. 이 앱은 정적이라 그 경로로는 안 됩니다.
- 가장 깔끔한 해결: 그 프로젝트를 **삭제**하고, 위 2번의 **"Pages" 탭**에서 다시 만들면서
  3번 표대로 **Framework preset = None**, **Deploy command = 비움**, **Build output = `out`**
  으로 설정하세요.
- OpenNext의 `migrate`가 빌드 머신에서 `package.json`·`next.config`·`wrangler.jsonc`·
  `open-next.config.ts` 등을 임시로 고쳤지만, 그건 **빌드 머신의 클론에만** 적용된 것이라
  **레포(GitHub)에는 아무 영향이 없습니다.** 커밋하지 않았으니 그대로 두면 됩니다.

## 4. 배포 후 필수 확인 (Supabase 인증)
1. Supabase 대시보드 → **Authentication** → **URL Configuration**:
   - **Site URL** 또는 **Redirect URLs**에 새 주소 `https://<프로젝트>.pages.dev` 를 추가.
   - (이메일+비밀번호 로그인만 쓰면 대개 문제없지만, 매직링크/소셜 로그인을 쓰면 필수입니다.)
2. 새 주소로 접속해 **로그인 → 매매 → 세이브 동기화**가 정상인지 확인.

## 5. 마무리
- 정상 확인되면 Vercel 프로젝트는 그대로 둬도(더 이상 트래픽이 안 감) 되고, 정리하고 싶으면
  Vercel에서 프로젝트를 삭제하면 됩니다.
- (선택) 나중에 커스텀 도메인을 Cloudflare Pages에 연결할 수 있습니다.

## 재배포 (자동)
- `main` 브랜치에 push하면 Cloudflare가 **자동으로 재빌드·재배포**합니다. 별도 조작 불필요.

---

## ⚠️ 이 앱 특유의 주의사항
- **`NEXT_PUBLIC_BASE_PATH` 를 절대 설정하지 마세요.** 이 값은 GitHub Pages(하위경로) 배포용입니다.
  Cloudflare는 루트 도메인이라, 설정하면 JS/CSS 경로가 어긋나 화면이 깨집니다(자산 404). 기본값(빈 값)이 맞습니다.
- 빌드가 20분(무료 빌드 시간 한도)을 넘겨 실패하면(드묾), Build command를 **`npx next build`** 로
  바꾸세요. 레포에 커밋된 시장 체크포인트를 그대로 사용해 빌드가 빨라집니다.
- 도메인이 바뀌므로 **기존 로그인 세션은 새 주소에서 다시 로그인**해야 합니다(정상 동작).

---

## 대안: GitHub Pages
`next.config.ts`에 이미 `NEXT_PUBLIC_BASE_PATH` 지원이 있어 GitHub Pages로도 배포 가능하지만,
대역폭 소프트 제한이 있어 **Cloudflare Pages를 권장**합니다. GitHub Pages로 갈 경우에만
`NEXT_PUBLIC_BASE_PATH=/저장소이름` 을 빌드에 설정하세요(Cloudflare에서는 설정 금지).
