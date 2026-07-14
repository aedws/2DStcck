// AUTO-GENERATED from data/companies.csv (+ data/character-quotes.csv) — 직접 수정 금지, `npm run import:companies` 로 재생성
import type {
  Character,
  CharacterQuoteEntry,
  StockDefinition,
} from "@/lib/types/market";

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
    "name": "Millennium Tech 100",
    "sector": "ETF",
    "initialPrice": 32000,
    "volatility": 0.012,
    "drift": 0.001,
    "beta": 1.1,
    "description": "키보토스 테크 기업에 집중 투자하는 기술주 ETF.",
    "etfHoldings": [
      {
        "stockId": "wwxly",
        "weight": 0.25
      },
      {
        "stockId": "bagdi",
        "weight": 0.2
      },
      {
        "stockId": "bavts",
        "weight": 0.2
      },
      {
        "stockId": "nkexa",
        "weight": 0.15
      },
      {
        "stockId": "baui",
        "weight": 0.1
      },
      {
        "stockId": "nkvol",
        "weight": 0.1
      }
    ],
    "ceoId": "chr_baqqq"
  },
  {
    "id": "bamlb",
    "ticker": "BAMLB",
    "name": "Millennium Academy Bond",
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
    "quarterlyDividend": 130,
    "ceoId": "chr_bamlb"
  },
  {
    "id": "bagdi",
    "ticker": "BAGDI",
    "name": "GameDev Interactive",
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
    "name": "Veritas Security",
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
    "name": "NERU Tactical Group",
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
    "name": "Hibiki Ordnance Systems",
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
    "name": "Millennium Medical",
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
    "name": "Kivotos Composite Index",
    "sector": "ETF",
    "initialPrice": 54000,
    "volatility": 0.01,
    "drift": 0.0008,
    "beta": 1,
    "description": "시장 대표 13종목에 분산 투자하는 종합 지수 ETF.",
    "etfHoldings": [
      {
        "stockId": "bahina",
        "weight": 0.1
      },
      {
        "stockId": "baridc",
        "weight": 0.09
      },
      {
        "stockId": "wwjin",
        "weight": 0.09
      },
      {
        "stockId": "wwchl",
        "weight": 0.09
      },
      {
        "stockId": "bahbk",
        "weight": 0.08
      },
      {
        "stockId": "wwxly",
        "weight": 0.08
      },
      {
        "stockId": "bavts",
        "weight": 0.07
      },
      {
        "stockId": "wwjyn",
        "weight": 0.07
      },
      {
        "stockId": "bagdi",
        "weight": 0.07
      },
      {
        "stockId": "basmr",
        "weight": 0.07
      },
      {
        "stockId": "nkneo",
        "weight": 0.07
      },
      {
        "stockId": "bahrn",
        "weight": 0.06
      },
      {
        "stockId": "nkltr",
        "weight": 0.06
      }
    ],
    "quarterlyDividend": 540,
    "ceoId": "chr_baspy"
  },
  {
    "id": "bakaya",
    "ticker": "BAKAYA",
    "name": "Shiranui Heavy Industries",
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
    "name": "Kivotos Municipal Bond",
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
    "quarterlyDividend": 125,
    "ceoId": "chr_bakvb"
  },
  {
    "id": "baabs",
    "ticker": "BAABS",
    "name": "Abydos Security",
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
    "name": "Abydos Academy Bond",
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
    "quarterlyDividend": 160,
    "ceoId": "chr_baabb"
  },
  {
    "id": "ba68",
    "ticker": "BA68",
    "name": "Problem Solver 68",
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
    "name": "Prefect Defense Corporation",
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
    "name": "Gourmet Research Dining",
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
    "name": "Gehenna Kitchen Foods",
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
    "name": "Rescue Knights Biotech",
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
    "name": "Kasumi Construction",
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
    "name": "Kirara Cosmetics",
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
    "name": "Gehenna Academy Bond",
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
    "quarterlyDividend": 155,
    "ceoId": "chr_baghb"
  },
  {
    "id": "bahnk",
    "ticker": "BAHNK",
    "name": "Hanako Education Group",
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
    "name": "Suzumi Guard Services",
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
    "name": "Archive Mediaworks",
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
    "name": "Airi Coffee Company",
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
    "name": "Mine Pharmaceuticals",
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
    "name": "Justice Task Force Security",
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
    "name": "Mari Pilgrim Tours",
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
    "name": "Trinity Academy Bond",
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
    "quarterlyDividend": 130,
    "ceoId": "chr_batrb"
  },
  {
    "id": "wwjin",
    "ticker": "WWJIN",
    "name": "Jinzhou Financial Group",
    "sector": "금융",
    "initialPrice": 18500,
    "volatility": 0.022,
    "drift": 0.0005,
    "beta": 1.1,
    "description": "금주와 려강을 잇는 종합 금융지주.",
    "eventBias": {
      "실적": 2
    },
    "quarterlyDividend": 140,
    "ceoId": "chr_wwjin"
  },
  {
    "id": "wwchl",
    "ticker": "WWCHL",
    "name": "Changli Energy Holdings",
    "sector": "에너지",
    "initialPrice": 21000,
    "volatility": 0.028,
    "drift": 0.0004,
    "beta": 0.7,
    "description": "화력·신재생을 아우르는 에너지 지주회사.",
    "eventBias": {
      "수주": 2
    },
    "quarterlyDividend": 210,
    "ceoId": "chr_wwchl"
  },
  {
    "id": "wwxly",
    "ticker": "WWXLY",
    "name": "Xiangli Yao Laboratories",
    "sector": "기술",
    "initialPrice": 43000,
    "volatility": 0.038,
    "drift": 0.0009,
    "beta": 1.4,
    "description": "전술 인형과 연산 코어를 개발하는 첨단 기술 기업.",
    "eventBias": {
      "신제품": 3
    },
    "ceoId": "chr_wwxly"
  },
  {
    "id": "wwjyn",
    "ticker": "WWJYN",
    "name": "Qinglong Air Logistics",
    "sector": "운송",
    "initialPrice": 16000,
    "volatility": 0.026,
    "drift": 0.0005,
    "beta": 1,
    "description": "하늘길을 여는 항공 화물·물류 전문사.",
    "eventBias": {
      "수주": 2
    },
    "ceoId": "chr_wwjyn"
  },
  {
    "id": "wwskp",
    "ticker": "WWSKP",
    "name": "Blackshore Telecom",
    "sector": "통신",
    "initialPrice": 12500,
    "volatility": 0.018,
    "drift": 0.0004,
    "beta": 0.6,
    "description": "해안 관측망 기반의 통신 네트워크 사업자.",
    "eventBias": {
      "실적": 1.5
    },
    "quarterlyDividend": 95,
    "ceoId": "chr_wwskp"
  },
  {
    "id": "wwcam",
    "ticker": "WWCAM",
    "name": "Camellya Botanicals",
    "sector": "농업",
    "initialPrice": 9800,
    "volatility": 0.04,
    "drift": 0.0003,
    "beta": 0.8,
    "description": "희귀 화훼와 특수 작물을 재배하는 농업 기업.",
    "eventBias": {
      "스캔들": 2,
      "신제품": 2
    },
    "ceoId": "chr_wwcam"
  },
  {
    "id": "nkltr",
    "ticker": "NKLTR",
    "name": "Liter Development",
    "sector": "부동산",
    "initialPrice": 26500,
    "volatility": 0.024,
    "drift": 0.0005,
    "beta": 0.9,
    "description": "무너진 도시를 다시 세우는 부동산 개발사.",
    "eventBias": {
      "수주": 3
    },
    "ceoId": "chr_nkltr"
  },
  {
    "id": "nkvol",
    "ticker": "NKVOL",
    "name": "Volume Broadcasting",
    "sector": "엔터",
    "initialPrice": 14000,
    "volatility": 0.034,
    "drift": 0.0006,
    "beta": 1.2,
    "description": "예능과 라이브 방송을 만드는 종합 엔터테인먼트사.",
    "eventBias": {
      "신제품": 2,
      "행보": 2
    },
    "ceoId": "chr_nkvol"
  },
  {
    "id": "nkneo",
    "ticker": "NKNEO",
    "name": "Neon Megastore",
    "sector": "유통",
    "initialPrice": 11000,
    "volatility": 0.03,
    "drift": 0.0004,
    "beta": 0.9,
    "description": "없는 게 없는 대형 유통 체인.",
    "eventBias": {
      "실적": 2
    },
    "quarterlyDividend": 70,
    "ceoId": "chr_nkneo"
  },
  {
    "id": "nkexa",
    "ticker": "NKEXA",
    "name": "Exia Interactive",
    "sector": "게임",
    "initialPrice": 23500,
    "volatility": 0.045,
    "drift": 0.0007,
    "beta": 1.3,
    "description": "e스포츠와 온라인 게임을 운영하는 게임사.",
    "eventBias": {
      "신제품": 3,
      "스캔들": 1.5
    },
    "ceoId": "chr_nkexa"
  },
  {
    "id": "pmcx",
    "ticker": "PMCX",
    "name": "Kivotos Security ETF",
    "sector": "ETF",
    "initialPrice": 15000,
    "volatility": 0.01,
    "drift": 0,
    "beta": 1,
    "description": "키보토스 치안·경비(PMC) 6개사에 분산 투자하는 섹터 ETF.",
    "etfHoldings": [
      {
        "stockId": "bahina",
        "weight": 0.25
      },
      {
        "stockId": "baabs",
        "weight": 0.2
      },
      {
        "stockId": "banru",
        "weight": 0.15
      },
      {
        "stockId": "batrg",
        "weight": 0.15
      },
      {
        "stockId": "baszm",
        "weight": 0.15
      },
      {
        "stockId": "ba68",
        "weight": 0.1
      }
    ]
  },
  {
    "id": "bndx",
    "ticker": "BNDX",
    "name": "Academy Bond ETF",
    "sector": "ETF",
    "initialPrice": 10000,
    "volatility": 0.005,
    "drift": 0,
    "beta": 0.15,
    "description": "학원채·지역채 5종을 담은 채권 ETF.",
    "etfHoldings": [
      {
        "stockId": "batrb",
        "weight": 0.25
      },
      {
        "stockId": "bamlb",
        "weight": 0.25
      },
      {
        "stockId": "bakvb",
        "weight": 0.2
      },
      {
        "stockId": "baghb",
        "weight": 0.15
      },
      {
        "stockId": "baabb",
        "weight": 0.15
      }
    ],
    "quarterlyDividend": 125
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
  },
  {
    "id": "chr_wwjin",
    "name": "금희",
    "title": "회장",
    "traits": [
      "성실",
      "카리스마",
      "천재"
    ],
    "bio": "금주를 이끄는 젊은 수장. 온화하지만 결단은 누구보다 빠르다.",
    "emoji": "🐲"
  },
  {
    "id": "chr_wwchl",
    "name": "장리",
    "title": "회장",
    "traits": [
      "천재",
      "카리스마"
    ],
    "bio": "불꽃 같은 통찰로 판 전체를 설계하는 전략가.",
    "emoji": "🔥"
  },
  {
    "id": "chr_wwxly",
    "name": "상리요",
    "title": "수석연구원",
    "traits": [
      "천재",
      "워커홀릭"
    ],
    "bio": "실험에 몰두하면 밤낮을 잊는 젊은 천재.",
    "emoji": "🤖"
  },
  {
    "id": "chr_wwjyn",
    "name": "기염",
    "title": "대표",
    "traits": [
      "카리스마",
      "성실"
    ],
    "bio": "청룡 기장 출신. 어떤 악천후에도 화물은 도착한다.",
    "emoji": "🐉"
  },
  {
    "id": "chr_wwskp",
    "name": "수안인",
    "title": "관리자",
    "traits": [
      "은둔형",
      "천재",
      "성실"
    ],
    "bio": "블랙쇼어의 등대처럼 조용히 네트워크를 지키는 관리자.",
    "emoji": "🌊"
  },
  {
    "id": "chr_wwcam",
    "name": "카멜리야",
    "title": "대표",
    "traits": [
      "사고뭉치",
      "카리스마"
    ],
    "bio": "아름답지만 어딘가 위험한 향기의 플로리스트.",
    "emoji": "🌺"
  },
  {
    "id": "chr_nkltr",
    "name": "리터",
    "title": "소장",
    "traits": [
      "천재",
      "워커홀릭"
    ],
    "bio": "전선 사령부도 하루 만에 올리는 건설의 명장.",
    "emoji": "👷"
  },
  {
    "id": "chr_nkvol",
    "name": "볼륨",
    "title": "프로듀서",
    "traits": [
      "카리스마"
    ],
    "bio": "시청률을 위해서라면 어디든 카메라를 든다.",
    "emoji": "🎙️"
  },
  {
    "id": "chr_nkneo",
    "name": "네온",
    "title": "점장",
    "traits": [
      "사고뭉치"
    ],
    "bio": "좋아하는 물건 앞에서는 지갑이 먼저 열리는 점장.",
    "emoji": "🛒"
  },
  {
    "id": "chr_nkexa",
    "name": "엑시아",
    "title": "CEO",
    "traits": [
      "천재",
      "은둔형",
      "사고뭉치"
    ],
    "bio": "랭킹 1위를 위해 밤을 새우는 게이머 사장.",
    "emoji": "🎧"
  }
];

export const CSV_CHARACTER_QUOTES: CharacterQuoteEntry[] = [];
