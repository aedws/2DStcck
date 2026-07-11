// AUTO-GENERATED from src/data/generated.ts — edit the original and run `npm run sync:functions`
// AUTO-GENERATED from data/companies.csv — 직접 수정 금지, `npm run import:companies` 로 재생성
import type { Character, StockDefinition } from "./types.ts";

export const CSV_COMPANIES: StockDefinition[] = [
  {
    "id": "baridc",
    "ticker": "BARIDC",
    "name": "RIO Defense Corporation",
    "sector": "방산",
    "initialPrice": 98000,
    "volatility": 0.03,
    "drift": 0.0005,
    "beta": 0.7,
    "description": "궤도 방위 시스템과 전술 AI를 개발하는 방산 기업.",
    "eventBias": {
      "수주": 4,
      "스캔들": 0.5
    },
    "ceoId": "chr_baridc"
  },
  {
    "id": "baqqq",
    "ticker": "BAQQQ",
    "name": "밀레니엄 테크 지수",
    "sector": "지수",
    "initialPrice": 32000,
    "volatility": 0.012,
    "drift": 0.001,
    "beta": 1.1,
    "description": "밀레니엄 소속 기술 기업을 담은 테크 지수 상품.",
    "ceoId": "chr_baqqq"
  },
  {
    "id": "bamlb",
    "ticker": "BAMLB",
    "name": "밀레니엄 학원채",
    "sector": "채권",
    "initialPrice": 10200,
    "volatility": 0.006,
    "drift": 0.0004,
    "beta": 0.15,
    "description": "밀레니엄 사이언스 스쿨이 발행한 우량 학원채.",
    "eventBias": {
      "수주": 0,
      "신제품": 0,
      "실적": 0.3
    },
    "ceoId": "chr_bamlb"
  },
  {
    "id": "bagdi",
    "ticker": "BAGDI",
    "name": "게임개발부 인터랙티브",
    "sector": "게임",
    "initialPrice": 45000,
    "volatility": 0.042,
    "drift": 0.0007,
    "beta": 1.3,
    "description": "화제작을 연달아 내놓는 소규모 게임 스튜디오.",
    "eventBias": {
      "신제품": 3,
      "실적": 1.5
    },
    "ceoId": "chr_bagdi"
  },
  {
    "id": "bavts",
    "ticker": "BAVTS",
    "name": "베리타스 시큐리티",
    "sector": "보안",
    "initialPrice": 88000,
    "volatility": 0.03,
    "drift": 0.0008,
    "beta": 1.2,
    "description": "해킹 방어와 침투 테스트를 수행하는 보안 기업.",
    "eventBias": {
      "수주": 2,
      "신제품": 2
    },
    "ceoId": "chr_bavts"
  },
  {
    "id": "banru",
    "ticker": "BANRU",
    "name": "네루 태스크포스",
    "sector": "PMC",
    "initialPrice": 52000,
    "volatility": 0.045,
    "drift": 0.0006,
    "beta": 1.1,
    "description": "물불 가리지 않는 실전파 경호·경비 회사.",
    "eventBias": {
      "수주": 3,
      "스캔들": 2
    },
    "ceoId": "chr_banru"
  },
  {
    "id": "bahbk",
    "ticker": "BAHBK",
    "name": "엔지니어부 오드넌스",
    "sector": "방산",
    "initialPrice": 120000,
    "volatility": 0.032,
    "drift": 0.0006,
    "beta": 0.8,
    "description": "자주포 드론과 지원 화기를 설계하는 방산 기업.",
    "eventBias": {
      "수주": 4,
      "신제품": 2
    },
    "ceoId": "chr_bahbk"
  },
  {
    "id": "basmr",
    "ticker": "BASMR",
    "name": "밀레니엄 메디컬",
    "sector": "헬스케어",
    "initialPrice": 63000,
    "volatility": 0.022,
    "drift": 0.0005,
    "beta": 0.7,
    "description": "학생 건강관리와 원격 진료 서비스를 제공하는 의료 기업.",
    "eventBias": {
      "실적": 2
    },
    "ceoId": "chr_basmr"
  },
  {
    "id": "baspy",
    "ticker": "BASPY",
    "name": "키보토스 종합 지수",
    "sector": "지수",
    "initialPrice": 54000,
    "volatility": 0.01,
    "drift": 0.0008,
    "beta": 1,
    "description": "키보토스 전 학원을 아우르는 종합 지수 상품.",
    "ceoId": "chr_baspy"
  },
  {
    "id": "bakaya",
    "ticker": "BAKAYA",
    "name": "시라누이 중공업",
    "sector": "방산",
    "initialPrice": 97000,
    "volatility": 0.03,
    "drift": 0.0005,
    "beta": 0.75,
    "description": "장갑 차량과 중화기를 양산하는 중공업 방산사.",
    "eventBias": {
      "수주": 3
    },
    "ceoId": "chr_bakaya"
  },
  {
    "id": "bakvb",
    "ticker": "BAKVB",
    "name": "키보토스 지역채",
    "sector": "채권",
    "initialPrice": 10100,
    "volatility": 0.005,
    "drift": 0.0003,
    "beta": 0.1,
    "description": "연방학생회가 발행한 키보토스 지역 채권.",
    "eventBias": {
      "수주": 0,
      "신제품": 0,
      "실적": 0.3
    },
    "ceoId": "chr_bakvb"
  },
  {
    "id": "baabs",
    "ticker": "BAABS",
    "name": "아비도스 시큐리티",
    "sector": "PMC",
    "initialPrice": 38000,
    "volatility": 0.05,
    "drift": 0.0008,
    "beta": 1.2,
    "description": "인원은 적지만 실전에서 가장 믿을 수 있는 경비회사.",
    "eventBias": {
      "수주": 3,
      "스캔들": 1.5
    },
    "ceoId": "chr_baabs"
  },
  {
    "id": "baabb",
    "ticker": "BAABB",
    "name": "아비도스 학원채",
    "sector": "채권",
    "initialPrice": 9400,
    "volatility": 0.015,
    "drift": 0.0008,
    "beta": 0.35,
    "description": "재정난의 아비도스가 발행한 고수익 학원채.",
    "eventBias": {
      "수주": 0,
      "신제품": 0,
      "실적": 0.5
    },
    "ceoId": "chr_baabb"
  },
  {
    "id": "ba68",
    "ticker": "BA68",
    "name": "해결사68 홀딩스",
    "sector": "PMC",
    "initialPrice": 21000,
    "volatility": 0.055,
    "drift": 0.0004,
    "beta": 1.3,
    "description": "의뢰를 가리지 않는 자칭 하드보일드 해결사 사무소.",
    "eventBias": {
      "수주": 2,
      "스캔들": 3
    },
    "ceoId": "chr_ba68"
  },
  {
    "id": "bahina",
    "ticker": "BAHINA",
    "name": "프레펙트 디펜스",
    "sector": "PMC",
    "initialPrice": 142000,
    "volatility": 0.038,
    "drift": 0.0009,
    "beta": 1,
    "description": "게헨나 풍기위원회 직영의 최정예 방위 서비스.",
    "eventBias": {
      "수주": 3,
      "스캔들": 0.5
    },
    "ceoId": "chr_bahina"
  },
  {
    "id": "bahrn",
    "ticker": "BAHRN",
    "name": "미식연구회 다이닝",
    "sector": "요식업",
    "initialPrice": 47000,
    "volatility": 0.028,
    "drift": 0.0005,
    "beta": 0.85,
    "description": "미식의 극한을 추구하는 프리미엄 레스토랑 체인.",
    "eventBias": {
      "신제품": 3
    },
    "ceoId": "chr_bahrn"
  },
  {
    "id": "bafka",
    "ticker": "BAFKA",
    "name": "게헨나 키친",
    "sector": "요식업",
    "initialPrice": 26000,
    "volatility": 0.03,
    "drift": 0.0004,
    "beta": 0.8,
    "description": "대량 급식과 도시락 사업을 운영하는 푸드 서비스.",
    "eventBias": {
      "실적": 2
    },
    "ceoId": "chr_bafka"
  },
  {
    "id": "basena",
    "ticker": "BASENA",
    "name": "구호기사단 바이오",
    "sector": "바이오",
    "initialPrice": 71000,
    "volatility": 0.048,
    "drift": 0.0006,
    "beta": 0.9,
    "description": "응급 의료와 구호 기술을 연구하는 바이오 기업.",
    "eventBias": {
      "신제품": 3,
      "스캔들": 1.5
    },
    "ceoId": "chr_basena"
  },
  {
    "id": "baksm",
    "ticker": "BAKSM",
    "name": "카스미 건설",
    "sector": "건설",
    "initialPrice": 33000,
    "volatility": 0.028,
    "drift": 0.0004,
    "beta": 0.9,
    "description": "부수는 것도 짓는 것도 빠른 종합 건설사.",
    "eventBias": {
      "수주": 3
    },
    "ceoId": "chr_baksm"
  },
  {
    "id": "bakrr",
    "ticker": "BAKRR",
    "name": "키라라 코스메틱",
    "sector": "화장품",
    "initialPrice": 41000,
    "volatility": 0.032,
    "drift": 0.0005,
    "beta": 1,
    "description": "트렌드를 이끄는 뷰티·코스메틱 브랜드.",
    "eventBias": {
      "신제품": 3
    },
    "ceoId": "chr_bakrr"
  },
  {
    "id": "baghb",
    "ticker": "BAGHB",
    "name": "게헨나 학원채",
    "sector": "채권",
    "initialPrice": 9700,
    "volatility": 0.012,
    "drift": 0.0006,
    "beta": 0.3,
    "description": "변동성이 큰 게헨나 발행 학원채. 고위험 고수익.",
    "eventBias": {
      "수주": 0,
      "신제품": 0,
      "실적": 0.5
    },
    "ceoId": "chr_baghb"
  },
  {
    "id": "bahnk",
    "ticker": "BAHNK",
    "name": "하나코 에듀케이션",
    "sector": "교육",
    "initialPrice": 29000,
    "volatility": 0.02,
    "drift": 0.0005,
    "beta": 0.6,
    "description": "보충수업 노하우로 만든 온라인 교육 플랫폼.",
    "eventBias": {
      "실적": 2
    },
    "ceoId": "chr_bahnk"
  },
  {
    "id": "baszm",
    "ticker": "BASZM",
    "name": "스즈미 가드",
    "sector": "PMC",
    "initialPrice": 24000,
    "volatility": 0.035,
    "drift": 0.0005,
    "beta": 1,
    "description": "행사 경비와 신변 보호를 전문으로 하는 경비회사.",
    "eventBias": {
      "수주": 2
    },
    "ceoId": "chr_baszm"
  },
  {
    "id": "baui",
    "ticker": "BAUI",
    "name": "도서부 미디어웍스",
    "sector": "미디어",
    "initialPrice": 19000,
    "volatility": 0.03,
    "drift": 0.0003,
    "beta": 1.1,
    "description": "전자책과 아카이브 서비스를 운영하는 미디어 기업.",
    "eventBias": {
      "신제품": 2
    },
    "ceoId": "chr_baui"
  },
  {
    "id": "baair",
    "ticker": "BAAIR",
    "name": "카페 아이리",
    "sector": "요식업",
    "initialPrice": 15000,
    "volatility": 0.025,
    "drift": 0.0004,
    "beta": 0.8,
    "description": "골목마다 늘어나는 아늑한 카페 프랜차이즈.",
    "eventBias": {
      "신제품": 2
    },
    "ceoId": "chr_baair"
  },
  {
    "id": "bamine",
    "ticker": "BAMINE",
    "name": "미네 제약",
    "sector": "바이오",
    "initialPrice": 58000,
    "volatility": 0.05,
    "drift": 0.0005,
    "beta": 0.9,
    "description": "신약 파이프라인에 모든 것을 건 제약 벤처.",
    "eventBias": {
      "신제품": 3,
      "스캔들": 1.5
    },
    "ceoId": "chr_bamine"
  },
  {
    "id": "batrg",
    "ticker": "BATRG",
    "name": "정의실현 시큐리티",
    "sector": "PMC",
    "initialPrice": 31000,
    "volatility": 0.045,
    "drift": 0.0005,
    "beta": 1.1,
    "description": "불의를 보면 견적보다 출동이 먼저인 경비회사.",
    "eventBias": {
      "수주": 2,
      "스캔들": 2
    },
    "ceoId": "chr_batrg"
  },
  {
    "id": "bamari",
    "ticker": "BAMARI",
    "name": "마리 투어리즘",
    "sector": "관광",
    "initialPrice": 23000,
    "volatility": 0.026,
    "drift": 0.0004,
    "beta": 0.9,
    "description": "성지 순례 코스로 유명한 여행 전문사.",
    "eventBias": {
      "실적": 2
    },
    "ceoId": "chr_bamari"
  },
  {
    "id": "batrb",
    "ticker": "BATRB",
    "name": "트리니티 학원채",
    "sector": "채권",
    "initialPrice": 10300,
    "volatility": 0.006,
    "drift": 0.0004,
    "beta": 0.15,
    "description": "유서 깊은 트리니티가 발행한 최우량 학원채.",
    "eventBias": {
      "수주": 0,
      "신제품": 0,
      "실적": 0.3
    },
    "ceoId": "chr_batrb"
  }
];

export const CSV_CHARACTERS: Character[] = [
  {
    "id": "chr_baridc",
    "name": "츠카츠키 리오",
    "title": "CEO",
    "traits": [
      "천재",
      "은둔형",
      "회피형"
    ],
    "bio": "모습을 드러내지 않고 태스크 목록만으로 회사 전체를 지휘하는 은둔형 천재.",
    "emoji": "🛰️"
  },
  {
    "id": "chr_baqqq",
    "name": "우시오 노아",
    "title": "운용책임자",
    "traits": [
      "성실",
      "천재"
    ],
    "bio": "모든 지표를 외우고 다니는 세미나의 서기. 미소 뒤에 데이터가 있다.",
    "emoji": "📘"
  },
  {
    "id": "chr_bamlb",
    "name": "하야세 유우카",
    "title": "회계책임자",
    "traits": [
      "천재",
      "성실",
      "워커홀릭"
    ],
    "bio": "1원 단위 오차도 용납하지 않는 밀레니엄의 회계 담당.",
    "emoji": "🧮"
  },
  {
    "id": "chr_bagdi",
    "name": "텐도 아리스",
    "title": "CEO",
    "traits": [
      "천재",
      "사고뭉치"
    ],
    "bio": "게임에서 배운 말투로 회사를 이끄는 신비한 개발자. 빛이 되어라!",
    "emoji": "🎮"
  },
  {
    "id": "chr_bavts",
    "name": "아케보시 히마리",
    "title": "CTO",
    "traits": [
      "천재",
      "은둔형"
    ],
    "bio": "병상에서도 키보드는 놓지 않는 전설의 화이트 해커.",
    "emoji": "💻"
  },
  {
    "id": "chr_banru",
    "name": "미카모 네루",
    "title": "대표",
    "traits": [
      "사고뭉치",
      "카리스마"
    ],
    "bio": "말보다 주먹이 먼저 나가는 현장주의 대표.",
    "emoji": "🥊"
  },
  {
    "id": "chr_bahbk",
    "name": "네코즈카 히비키",
    "title": "수석엔지니어",
    "traits": [
      "천재",
      "은둔형"
    ],
    "bio": "수줍음이 많지만 포격 제원 계산은 키보토스 최고.",
    "emoji": "🐱"
  },
  {
    "id": "chr_basmr",
    "name": "오토하나 스미레",
    "title": "원장",
    "traits": [
      "성실"
    ],
    "bio": "어떤 환자도 정성으로 돌보는 온화한 보건의.",
    "emoji": "💉"
  },
  {
    "id": "chr_baspy",
    "name": "나나가미 린",
    "title": "운용책임자",
    "traits": [
      "워커홀릭",
      "카리스마"
    ],
    "bio": "연방학생회를 실질적으로 움직이는 냉철한 실무 최강자.",
    "emoji": "🏛️"
  },
  {
    "id": "chr_bakaya",
    "name": "시라누이 카야",
    "title": "CEO",
    "traits": [
      "카리스마"
    ],
    "bio": "웃는 얼굴로 납기를 지키게 만드는 무서운 경영자.",
    "emoji": "⚙️"
  },
  {
    "id": "chr_bakvb",
    "name": "오키 아오이",
    "title": "발행담당",
    "traits": [
      "성실"
    ],
    "bio": "서류 더미 속에서도 절대 실수하지 않는 총무.",
    "emoji": "📋"
  },
  {
    "id": "chr_baabs",
    "name": "타카나시 호시노",
    "title": "부장",
    "traits": [
      "카리스마",
      "은둔형"
    ],
    "bio": "평소엔 낮잠이 일과인 아저씨 말투의 부장. 위기엔 맨 앞에 선다.",
    "emoji": "🦈"
  },
  {
    "id": "chr_baabb",
    "name": "이자요이 노노미",
    "title": "회계담당",
    "traits": [
      "성실"
    ],
    "bio": "웃는 얼굴로 빚 장부를 관리하는 아비도스의 금고지기.",
    "emoji": "💰"
  },
  {
    "id": "chr_ba68",
    "name": "리쿠하치마 아루",
    "title": "사장",
    "traits": [
      "사고뭉치",
      "카리스마"
    ],
    "bio": "하드보일드를 꿈꾸지만 일이 자꾸 꼬이는 사장님.",
    "emoji": "😈"
  },
  {
    "id": "chr_bahina",
    "name": "소라사키 히나",
    "title": "위원장",
    "traits": [
      "워커홀릭",
      "천재",
      "카리스마"
    ],
    "bio": "잠도 잊고 일하는 게헨나 최강의 풍기위원장.",
    "emoji": "⚡"
  },
  {
    "id": "chr_bahrn",
    "name": "쿠로다테 하루나",
    "title": "오너셰프",
    "traits": [
      "카리스마"
    ],
    "bio": "새로운 맛을 위해서라면 수단을 가리지 않는 우아한 미식가.",
    "emoji": "🍽️"
  },
  {
    "id": "chr_bafka",
    "name": "아이키요 후우카",
    "title": "총괄셰프",
    "traits": [
      "성실"
    ],
    "bio": "한정된 재료로 기적을 만드는 급식의 달인.",
    "emoji": "🍲"
  },
  {
    "id": "chr_basena",
    "name": "히무로 세나",
    "title": "단장",
    "traits": [
      "성실",
      "워커홀릭"
    ],
    "bio": "환자가 있는 곳이라면 어디든 달려가는 구호기사.",
    "emoji": "🚑"
  },
  {
    "id": "chr_baksm",
    "name": "키누가와 카스미",
    "title": "현장소장",
    "traits": [
      "사고뭉치"
    ],
    "bio": "철거 실력만큼은 키보토스 제일이라는 소문의 소장.",
    "emoji": "🏗️"
  },
  {
    "id": "chr_bakrr",
    "name": "요자쿠라 키라라",
    "title": "크리에이티브디렉터",
    "traits": [
      "카리스마"
    ],
    "bio": "반짝이는 것에 진심인 뷰티 디렉터.",
    "emoji": "💄"
  },
  {
    "id": "chr_baghb",
    "name": "하누마 마코토",
    "title": "발행책임자",
    "traits": [
      "천재",
      "사고뭉치"
    ],
    "bio": "천재적인 두뇌와 폭주 기질을 동시에 가진 게헨나의 지배자.",
    "emoji": "👑"
  },
  {
    "id": "chr_bahnk",
    "name": "우라와 하나코",
    "title": "대표강사",
    "traits": [
      "사고뭉치"
    ],
    "bio": "수업보다 딴소리가 더 재밌다고 소문난 명물 강사.",
    "emoji": "📚"
  },
  {
    "id": "chr_baszm",
    "name": "모리즈키 스즈미",
    "title": "팀장",
    "traits": [
      "성실"
    ],
    "bio": "맡은 구역은 반드시 지켜내는 원칙주의 팀장.",
    "emoji": "🛡️"
  },
  {
    "id": "chr_baui",
    "name": "코제키 우이",
    "title": "편집장",
    "traits": [
      "은둔형",
      "워커홀릭"
    ],
    "bio": "서고 깊은 곳에서 밤새 원고를 다듬는 은둔형 편집장.",
    "emoji": "📖"
  },
  {
    "id": "chr_baair",
    "name": "쿠리무라 아이리",
    "title": "점장",
    "traits": [
      "성실"
    ],
    "bio": "단골 이름을 전부 기억하는 다정한 점장.",
    "emoji": "☕"
  },
  {
    "id": "chr_bamine",
    "name": "아오모리 미네",
    "title": "연구소장",
    "traits": [
      "성실"
    ],
    "bio": "임상 데이터 앞에서만 눈빛이 바뀌는 연구자.",
    "emoji": "🧪"
  },
  {
    "id": "chr_batrg",
    "name": "켄자키 츠루기",
    "title": "대장",
    "traits": [
      "사고뭉치",
      "카리스마"
    ],
    "bio": "정의 실현 앞에서는 건물 수리비를 계산하지 않는 대장.",
    "emoji": "⚔️"
  },
  {
    "id": "chr_bamari",
    "name": "이오치 마리",
    "title": "가이드장",
    "traits": [
      "성실"
    ],
    "bio": "여행자의 마음까지 살피는 성실한 가이드.",
    "emoji": "⛪"
  },
  {
    "id": "chr_batrb",
    "name": "미소노 미카",
    "title": "티파티대표",
    "traits": [
      "카리스마",
      "사고뭉치"
    ],
    "bio": "화사한 미소 뒤에 폭풍 같은 변덕을 숨긴 트리니티의 중심.",
    "emoji": "🌸"
  }
];
