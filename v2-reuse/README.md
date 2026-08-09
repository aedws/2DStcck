# 2DStock V2 재사용 인계 패키지

구 시스템에서 **화면 디자인, 종목 설정, 캐릭터 콘텐츠**만 분리한 정적 자료입니다. 이 폴더는 실행 가능한 거래소가 아니며, 기존 가격 엔진·지갑·저장·복구·DB 코드를 가져오지 않습니다.

## 폴더 구성

- `design/`: 색상 토큰, 디자인 규칙, 순수 표시 컴포넌트, 기존 UI 기준 이미지
- `content/base-instruments.json`: 직접 설정된 기본 종목 메타데이터. V2의 우선 입력
- `content/instruments.json`: 기본 종목과 구 엔진이 자동 생성한 파생 종목을 합친 전체 참고 목록
- `content/characters.json`: 캐릭터 이름, 직함, 성격, 소개, 이모지
- `content/character-quotes.json`: 캐릭터별 호재·악재 대사
- `content/event-copy.json`: 시장 이벤트의 제목과 설명 문구. 가격 충격 수치는 제외
- `content/generic-event-quotes.json`: 공통 사건 대사 풀
- `content/relationship-copy.json`: 호감도와 보유 관계에 사용할 문구
- `content/legacy-source/`: 원본 CSV 보관본. 추적용이며 V2 런타임 입력으로 바로 쓰지 않는 것을 권장
- `manifest.json`: 추출 수량과 제외 범위

## V2에서 가져가는 기준

1. `id`와 `ticker`는 콘텐츠 식별자 호환을 위해 유지합니다.
2. 종목명·설명·섹터·캐릭터 연결·ETF 구성은 콘텐츠 초안으로 재사용할 수 있습니다.
3. 가격, 변동성, 드리프트, 베타, 배당 수치와 상장·소각 조건은 새 시장 엔진에서 다시 정의합니다.
4. 화면은 토큰과 시각 레퍼런스만 계승하고, 기존 Zustand 저장소나 클라이언트 거래 로직은 연결하지 않습니다.
5. 캐릭터 애착 요소는 콘텐츠를 유지하되 호감도, 우선주, 계약 이결권 등의 규칙은 서버 권위 모델로 다시 구현합니다.

## 다시 추출하기

원본 콘텐츠가 바뀌면 프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
node_modules\.bin\tsx.cmd scripts\export-v2-reuse.ts
```

추출기는 정적 콘텐츠만 내보내며 기존 원본 파일을 수정하지 않습니다.
