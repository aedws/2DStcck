# V1 피드백 Google Sheets 수집기

V1 정적 프론트가 Supabase `feedback` 테이블 대신 Google Sheets에 개선안을
직접 접수하도록 연결하는 Apps Script 웹앱입니다.

## 설치

1. Google Sheets에서 새 스프레드시트를 만듭니다.
2. `확장 프로그램 → Apps Script`를 열고 `Code.gs` 내용을 붙여넣습니다.
3. 프로젝트 설정에서 `appsscript.json` 표시를 켠 뒤 이 폴더의 manifest로 교체합니다.
4. 편집기에서 `setupFeedbackSheet`를 한 번 실행하고 권한을 승인합니다.
5. `배포 → 새 배포 → 웹 앱`에서 다음과 같이 배포합니다.
   - 실행 사용자: 나
   - 액세스 권한: 모든 사용자
6. `/exec`로 끝나는 배포 URL을 복사합니다. `/dev` 테스트 URL은 운영에 쓰지 않습니다.

## V1 연결

Cloudflare Pages의 V1 프로젝트 환경변수에 다음 값을 추가하고 재배포합니다.

```text
NEXT_PUBLIC_GOOGLE_FEEDBACK_WEB_APP_URL=https://script.google.com/macros/s/배포_ID/exec
NEXT_PUBLIC_GOOGLE_FEEDBACK_SHEET_URL=https://docs.google.com/spreadsheets/d/시트_ID/edit
```

GitHub Pages도 함께 쓴다면 저장소의 Actions variable에 같은 이름으로 URL을 등록합니다.
두 URL은 GitHub Actions variable 또는 Cloudflare Pages 환경변수로만 넣습니다.
시트 공유 권한은 운영자 전용으로 유지하며 Google 자격 증명은 코드에 넣지 않습니다.

## 시트 운영

- 새 요청은 `V1_Feedback` 탭에 `open` 상태로 들어옵니다.
- `status`, `admin_note`는 운영자가 직접 수정하는 칼럼입니다.
- 요청 ID 중복 방지, 같은 브라우저 30초 쿨다운, 동시 쓰기 잠금, 스프레드시트
  수식 주입 방지가 적용되어 있습니다.
- 사용자에게 제공되는 최근 접수 내역은 해당 브라우저 로컬 기록이며, 시트의
  `status` 변경을 다시 공개하지 않습니다.

## V2 관리자 받은편지함 연결

V2는 브라우저에 시트 주소나 관리자 토큰을 노출하지 않습니다. Apps Script의
스크립트 속성에 충분히 긴 `ADMIN_TOKEN`을 추가하고, 같은 값을 V2 Cloudflare
Worker의 `GOOGLE_FEEDBACK_ADMIN_TOKEN` secret으로 등록합니다. 운영 배포본은
스크립트 속성을 수정할 수 없는 상황에서도 해시만 고정해 검증할 수 있으며,
토큰 원문은 저장소에 남기지 않습니다. V2 Worker에는
`GOOGLE_FEEDBACK_WEB_APP_URL`도 secret으로 등록합니다.

관리자 조회는 로그인된 V2 소유자 세션만 `/api/admin/feedback`을 호출할 수 있고,
Worker가 서버 간 요청으로 `action=list`를 전달합니다. Apps Script를 수정한 뒤에는
기존 웹 앱 배포를 새 버전으로 다시 배포해야 합니다.
