# 기존 화면 출처 지도

V2 화면을 설계할 때 시각 구조만 참고할 원본 위치입니다. 아래 파일은 구 거래·저장 로직과 결합되어 있어 인계 폴더에 복사하지 않았습니다.

| 화면 | 원본 위치 | 가져갈 시각 요소 |
| --- | --- | --- |
| 시장 홈 | `src/app/page.tsx`, `src/components/home/` | 3단 시장 레이아웃, 종목 목록, 지수 요약 |
| 종목 상세 | `src/app/stock/[id]/StockPageClient.tsx` | 차트·호가·주문 패널 배치 |
| 선물 | `src/app/stock/[id]/FuturesView.tsx` | 증거금·포지션·청산 정보 위계 |
| 포트폴리오 | `src/app/portfolio/page.tsx` | 순자산 카드, 보유종목 표, 성과 요약 |
| 캐릭터 도감 | `src/app/characters/page.tsx` | 카드 그리드, 잠금/보유 관계 표현 |
| 캐릭터 상세 | `src/app/characters/[id]/CharacterDetailClient.tsx` | 소개, 관계 단계, 기업 연결 |
| 회사 | `src/app/company/page.tsx` | 기업 현황, 경영권, 지분 정보 패널 |
| 유저 ETF | `src/app/amc/page.tsx` | 펀드 카드, NAV, 구성종목 정보 |

이 지도에 있는 소스에서 Zustand, Supabase, 거래 함수, 정산 함수는 V2로 복사하지 않습니다.
