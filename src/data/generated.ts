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
  },
  {
    "id": "aeyvn",
    "ticker": "AEYVN",
    "name": "Yvonne Microsystems",
    "sector": "팹리스",
    "subsector": "반도체",
    "initialPrice": 72000,
    "volatility": 0.05,
    "drift": 0.0009,
    "beta": 1.5,
    "description": "AI 가속기와 GPU를 설계하는 팹리스 반도체 기업. 생산은 위탁하고 설계에 집중한다.",
    "eventBias": {
      "신제품": 3,
      "스캔들": 1.5
    },
    "ceoId": "chr_aeyvn"
  },
  {
    "id": "nkilg",
    "ticker": "NKILG",
    "name": "Elleg Power Grid",
    "sector": "유틸리티",
    "initialPrice": 41000,
    "volatility": 0.014,
    "drift": 0.0004,
    "beta": 0.45,
    "description": "도시 전력망과 송배전 인프라를 운영하는 전력 유틸리티.",
    "eventBias": {
      "실적": 1.5
    },
    "quarterlyDividend": 480,
    "ceoId": "chr_nkilg"
  },
  {
    "id": "aegil",
    "ticker": "AEGIL",
    "name": "Gilberta Advanced Materials",
    "sector": "소재",
    "initialPrice": 53000,
    "volatility": 0.03,
    "drift": 0.0005,
    "beta": 1.05,
    "description": "합금·2차전지 소재를 연구·공급하는 소재공학 기업.",
    "eventBias": {
      "수주": 2,
      "신제품": 2
    },
    "ceoId": "chr_aegil"
  },
  {
    "id": "wwlne",
    "ticker": "WWLNE",
    "name": "Linne Mobility",
    "sector": "모빌리티",
    "initialPrice": 45000,
    "volatility": 0.036,
    "drift": 0.0006,
    "beta": 1.15,
    "description": "전기차와 차세대 이동수단을 개발하는 모빌리티 기업.",
    "eventBias": {
      "신제품": 3
    },
    "ceoId": "chr_wwlne"
  },
  {
    "id": "ersua",
    "ticker": "ERSUA",
    "name": "Sua Assurance",
    "sector": "보험",
    "initialPrice": 57000,
    "volatility": 0.02,
    "drift": 0.0004,
    "beta": 0.6,
    "description": "손해·생명보험과 리스크 관리를 제공하는 보험사.",
    "eventBias": {
      "실적": 2
    },
    "quarterlyDividend": 320,
    "ceoId": "chr_ersua"
  },
  {
    "id": "nkmna",
    "ticker": "NKMNA",
    "name": "Mana Foundry",
    "sector": "파운드리",
    "subsector": "반도체",
    "initialPrice": 85000,
    "volatility": 0.032,
    "drift": 0.0007,
    "beta": 1.25,
    "description": "팹리스 기업의 칩을 위탁 생산하는 첨단 파운드리 기업.",
    "eventBias": {
      "수주": 3,
      "행보": 1
    },
    "ceoId": "chr_nkmna"
  },
  {
    "id": "wwmne",
    "ticker": "WWMNE",
    "name": "Monie Memory",
    "sector": "메모리",
    "subsector": "반도체",
    "initialPrice": 48000,
    "volatility": 0.048,
    "drift": 0.0007,
    "beta": 1.4,
    "description": "DRAM·낸드 메모리를 양산하는 반도체 기업. 업황 사이클이 극심하다.",
    "eventBias": {
      "실적": 3,
      "스캔들": 1
    },
    "ceoId": "chr_wwmne"
  },
  {
    "id": "wwlcl",
    "ticker": "WWLCL",
    "name": "Lucila Systems",
    "sector": "시스템반도체",
    "subsector": "반도체",
    "initialPrice": 66000,
    "volatility": 0.028,
    "drift": 0.0005,
    "beta": 1.05,
    "description": "CPU와 시스템 반도체를 설계·생산하는 종합반도체(IDM) 기업.",
    "eventBias": {
      "실적": 2,
      "신제품": 2
    },
    "quarterlyDividend": 260,
    "ceoId": "chr_wwlcl"
  },
  {
    "id": "nkccl",
    "ticker": "NKCCL",
    "name": "Cecil Lithography",
    "sector": "반도체장비",
    "subsector": "반도체",
    "initialPrice": 110000,
    "volatility": 0.04,
    "drift": 0.0008,
    "beta": 1.3,
    "description": "극자외선(EUV) 노광 장비를 독점 공급하는 반도체 장비 기업.",
    "eventBias": {
      "수주": 3,
      "신제품": 2
    },
    "ceoId": "chr_nkccl"
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
    "name": "파수인",
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
    "name": "카멜리아",
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
    "name": "리타",
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
  },
  {
    "id": "chr_aeyvn",
    "name": "이본",
    "title": "CEO",
    "traits": [
      "천재",
      "워커홀릭"
    ],
    "bio": "생산 라인 없이 설계만으로 시장을 지배하는 팹리스의 귀재.",
    "emoji": "💠"
  },
  {
    "id": "chr_nkilg",
    "name": "일레그",
    "title": "관리소장",
    "traits": [
      "성실"
    ],
    "bio": "도시의 불빛이 꺼지지 않게 밤새 전력망을 지키는 관리자.",
    "emoji": "🔌"
  },
  {
    "id": "chr_aegil",
    "name": "질베르타",
    "title": "수석연구원",
    "traits": [
      "천재",
      "워커홀릭"
    ],
    "bio": "새로운 합금과 소재로 산업의 기초를 다시 쓰는 연구자.",
    "emoji": "⚗️"
  },
  {
    "id": "chr_wwlne",
    "name": "린네",
    "title": "CEO",
    "traits": [
      "카리스마"
    ],
    "bio": "차세대 이동수단을 직접 몰아보며 다듬는 질주의 설계자.",
    "emoji": "🚗"
  },
  {
    "id": "chr_ersua",
    "name": "수아",
    "title": "대표",
    "traits": [
      "성실",
      "카리스마"
    ],
    "bio": "최악을 미리 계산해 사람들의 내일을 지키는 보험 설계자.",
    "emoji": "☂️"
  },
  {
    "id": "chr_nkmna",
    "name": "마나",
    "title": "CEO",
    "traits": [
      "성실",
      "카리스마"
    ],
    "bio": "고객사 설계를 완벽한 수율로 찍어내는 위탁생산의 강자.",
    "emoji": "🏭"
  },
  {
    "id": "chr_wwmne",
    "name": "모니에",
    "title": "CEO",
    "traits": [
      "천재",
      "사고뭉치"
    ],
    "bio": "메모리 슈퍼사이클의 파도를 온몸으로 타는 승부사.",
    "emoji": "💾"
  },
  {
    "id": "chr_wwlcl",
    "name": "루실라",
    "title": "CEO",
    "traits": [
      "천재",
      "성실"
    ],
    "bio": "설계부터 생산까지 직접 쥔 종합반도체의 노련한 경영자.",
    "emoji": "🧠"
  },
  {
    "id": "chr_nkccl",
    "name": "세실",
    "title": "CEO",
    "traits": [
      "천재",
      "워커홀릭"
    ],
    "bio": "EUV 노광 장비를 홀로 만들어내는 정밀공학의 정점.",
    "emoji": "🔬"
  }
];

export const CSV_CHARACTER_QUOTES: CharacterQuoteEntry[] = [
  {
    "characterId": "chr_baridc",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "태스크 목록에 한 줄 추가해 두죠. '성공'.",
      "예상 범위 안입니다. 굳이 나설 일은 아니네요.",
      "좋은 결과군요. 다음 지시는 화면으로 내리겠습니다."
    ]
  },
  {
    "characterId": "chr_baridc",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "오차는 계산에 넣어 뒀습니다. 소란 떨 필요 없어요.",
      "…처리하겠습니다. 얼굴을 비출 만한 일은 아니고요.",
      "변수는 회수합니다. 목록 맨 위로 올려두죠."
    ]
  },
  {
    "characterId": "chr_baqqq",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "지표가 전부 우상향이에요. 숫자는 거짓말을 안 하니까요.",
      "미소 지을 이유가 하나 늘었네요. 데이터로 확인됐습니다.",
      "이 흐름"
    ]
  },
  {
    "characterId": "chr_baqqq",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "수치가 흔들렸네요. 원인 지표부터 다시 외워 두겠습니다.",
      "웃고는 있지만",
      "뒤로는 전량 재검산 중입니다."
    ]
  },
  {
    "characterId": "chr_bamlb",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "1원 단위까지 맞아떨어졌습니다. 이게 정상이죠.",
      "장부가 이렇게 예쁠 때가 제일 안심돼요.",
      "수익도 좋지만"
    ]
  },
  {
    "characterId": "chr_bamlb",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "어디서 새어나갔는지 소수점까지 추적하겠습니다.",
      "이 오차",
      "밤을 새워서라도 오늘 안에 메꿉니다."
    ]
  },
  {
    "characterId": "chr_bagdi",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "이번 판",
      "완벽한 클리어네요! 다음 스테이지 갑니다.",
      "수치가 반짝이고 있어요. 이런 게 개발자의 보람이죠!"
    ]
  },
  {
    "characterId": "chr_bagdi",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "으윽",
      "여기서 리스폰이네요. 세이브 포인트부터 다시!",
      "버그는 잡으라고 있는 거예요. 패치 준비할게요."
    ]
  },
  {
    "characterId": "chr_bavts",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "방화벽 안쪽은 조용하네요. 그게 최고의 성과죠.",
      "로그가 깨끗합니다. 이대로만 흘러가면 됩니다.",
      "화면 밖은 시끄럽겠지만"
    ]
  },
  {
    "characterId": "chr_bavts",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "침입 흔적이군요. 병상에서도 손은 움직입니다.",
      "패치는 이미 짜뒀어요. 소란 떨 새에 막는 게 낫죠.",
      "취약점 하나 찾았다 생각하면 됩니다. 메꾸면 그만."
    ]
  },
  {
    "characterId": "chr_banru",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋아",
      "이겼으면 됐어. 말은 그만하고 다음.",
      "결과로 보여줬잖아. 이런 게 실전이지."
    ]
  },
  {
    "characterId": "chr_banru",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "맞았으면 되받아치면 돼. 물러설 생각 없어.",
      "잔소리 말고 현장 나가자. 몸으로 메꾼다.",
      "넘어졌으면 일어나면 그만이야. 별거 아냐."
    ]
  },
  {
    "characterId": "chr_bahbk",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "어",
      "잘 맞았네요… 제원대로라 다행이에요.",
      "계산이 빗나가지 않아서 정말 다행입니다…."
    ]
  },
  {
    "characterId": "chr_bahbk",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "조준을 다시 잡을게요. 다음엔 안 빗나가요….",
      "죄",
      "죄송해요. 제원을 처음부터 재계산할게요."
    ]
  },
  {
    "characterId": "chr_basmr",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 소식이네요. 다들 무리하지 않으셨으면 해요.",
      "결과가 좋아도 건강이 우선이에요. 천천히 가요.",
      "이럴 때일수록 마음을 잘 돌봐야 해요."
    ]
  },
  {
    "characterId": "chr_basmr",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "괜찮아요",
      "다친 곳부터 살펴봐요. 회복이 먼저예요.",
      "나빠도 당황하지 마세요. 하나씩 치료하면 돼요."
    ]
  },
  {
    "characterId": "chr_baspy",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "예상대로입니다. 감상은 접고 다음 안건으로.",
      "좋은 실적이군요. 다만 방심이 가장 비쌉니다.",
      "성과는 인정합니다. 그럼 목표를 상향하죠."
    ]
  },
  {
    "characterId": "chr_baspy",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "감정은 사치입니다. 대응안부터 정리하죠.",
      "이 정도 변수는 계산에 있었습니다. 냉정하게 갑니다.",
      "책임 소재보다 복구 순서가 먼저입니다."
    ]
  },
  {
    "characterId": "chr_bakaya",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "후훗",
      "납기도 실적도 지켰네요. 당연한 결과죠?",
      "웃으면서 말하지만"
    ]
  },
  {
    "characterId": "chr_bakaya",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "어머",
      "이런. 그래도 납기는 지켜야겠죠? 후훗.",
      "웃는 얼굴로 말하지만"
    ]
  },
  {
    "characterId": "chr_bakvb",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "서류상 이상 없습니다. 좋은 결과네요.",
      "차분히 처리했습니다. 이런 날이 제일 좋아요.",
      "실수 없이 마무리됐습니다. 다행이에요."
    ]
  },
  {
    "characterId": "chr_bakvb",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "당황하지 않고 서류부터 다시 확인하겠습니다.",
      "실수는 없었는지 처음부터 짚어 보겠습니다.",
      "조용히"
    ]
  },
  {
    "characterId": "chr_baabs",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "오",
      "잘 풀렸구먼. 이럴 때 낮잠이 꿀맛이지.",
      "됐고"
    ]
  },
  {
    "characterId": "chr_baabs",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "걱정 마. 위험할 때 맨 앞에 서는 게 내 일이야.",
      "넘어졌으면 어때. 뒤는 내가 막을 테니 가.",
      "별일 아니야. 한숨 자고 나면 방법 나와."
    ]
  },
  {
    "characterId": "chr_baabb",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "후훗",
      "오늘은 빚이 조금 줄겠네요. 기쁜 일이에요.",
      "수익 났다고요? 장부에 웃으면서 적어 둘게요."
    ]
  },
  {
    "characterId": "chr_baabb",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "괜찮아요",
      "웃으면서 갚아 나가면 되니까요.",
      "빚은 늘 있었는걸요. 하나씩 메꾸면 돼요."
    ]
  },
  {
    "characterId": "chr_ba68",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "흥",
      "이번 의뢰는 깔끔하게 해결됐군. 하드보일드하게.",
      "봤지? 이런 게 진짜 해결사의 일이라고."
    ]
  },
  {
    "characterId": "chr_ba68",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "쳇",
      "또 일이 꼬였군… 그래도 의뢰는 완수한다.",
      "이 정도 트러블은 각본에 있었어. 아마도."
    ]
  },
  {
    "characterId": "chr_bahina",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 결과군요. 하지만 저는 아직 자리를 뜨지 않습니다.",
      "성과는 확인했습니다. 다음 업무로 넘어가죠.",
      "만족스럽네요. 잠은 다 끝낸 뒤에 자겠습니다."
    ]
  },
  {
    "characterId": "chr_bahina",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "질서가 흔들렸군요. 제가 바로 세우겠습니다.",
      "이 정도 혼란은 제가 밤새워 정리하면 됩니다.",
      "물러설 이유가 없습니다. 끝까지 책임지죠."
    ]
  },
  {
    "characterId": "chr_bahrn",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "이 맛이에요. 완벽한 한 접시가 완성됐네요.",
      "극한의 맛엔 극한의 결과가 따르는 법이죠.",
      "우아하게 즐기세요. 이건 저의 걸작이니까요."
    ]
  },
  {
    "characterId": "chr_bahrn",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "미완성이군요. 완벽한 맛을 위해 다시 만들죠.",
      "실패한 레시피는 버리면 그만. 재료는 얼마든지 있어요.",
      "이 정도로 물러설 미식가는 없어요. 다시 불을 켜죠."
    ]
  },
  {
    "characterId": "chr_bafka",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "한정된 재료로 이만하면 기적이죠. 다행이에요.",
      "다들 맛있게 먹어 준다면 그걸로 충분해요.",
      "좋은 소식이네요. 오늘 급식은 특별식으로 할까요."
    ]
  },
  {
    "characterId": "chr_bafka",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "재료가 부족해도 굶기진 않아요. 방법을 찾죠.",
      "모자란 대로 최선을 다해 한 끼를 지키겠습니다.",
      "걱정 마세요. 없으면 없는 대로 만들어 내니까요."
    ]
  },
  {
    "characterId": "chr_basena",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 소식이군요. 하지만 방심은 금물입니다.",
      "구할 수 있었다면 그걸로 됐습니다. 다음 현장으로.",
      "결과가 좋아도 저는 대기 태세를 풀지 않습니다."
    ]
  },
  {
    "characterId": "chr_basena",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "환자가 있는 곳이면 어디든 달려갑니다. 늦지 않아요.",
      "위급할수록 침착하게. 손이 떨리면 못 구합니다.",
      "포기라는 선택지는 제 사전에 없습니다."
    ]
  },
  {
    "characterId": "chr_baksm",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "오",
      "잘 부쉈… 아니",
      "잘 지었네! 결과 좋다!"
    ]
  },
  {
    "characterId": "chr_baksm",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "무너졌으면 다시 세우면 되지! 그게 건설이야!",
      "어이쿠",
      "좀 부쉈나? 뭐 새로 지으면 되니까!"
    ]
  },
  {
    "characterId": "chr_bakrr",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "반짝반짝! 이런 소식은 언제나 환영이에요!",
      "예뻐요",
      "이 결과! 트렌드는 우리가 만드는 거죠."
    ]
  },
  {
    "characterId": "chr_bakrr",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "조금 칙칙해졌네요. 다음 컬렉션으로 덮으면 돼요!",
      "트렌드는 돌고 도니까요. 곧 다시 반짝일 거예요.",
      "흠집 났다고 버리나요? 새로 칠하면 그만이죠!"
    ]
  },
  {
    "characterId": "chr_baghb",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "후하하! 당연한 결과다. 이 몸의 계산이니까!",
      "게헨나의 지배자에겐 이 정도는 시시하군.",
      "좋아"
    ]
  },
  {
    "characterId": "chr_baghb",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "크윽",
      "이 정도 폭주는 계획의 일부다… 아마도!",
      "물러설 것 같나? 오히려 판을 뒤엎어 주지!"
    ]
  },
  {
    "characterId": "chr_bahnk",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "오늘 수업은 잘됐네~ 아",
      "실적 말이에요 실적!",
      "이런 날은 딴소리해도 용서되겠죠? 헤헤."
    ]
  },
  {
    "characterId": "chr_bahnk",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "에이",
      "이런 날도 있는 거죠~ 다음 시간에 만회!",
      "망했다~ 싶어도 웃으면 반은 넘긴 거예요."
    ]
  },
  {
    "characterId": "chr_baszm",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "맡은 구역",
      "이상 없이 지켜냈습니다. 다행이에요.",
      "좋은 결과입니다. 하지만 경계는 늦추지 않아요."
    ]
  },
  {
    "characterId": "chr_baszm",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "흔들려도 제 자리는 지킵니다. 그게 제 원칙이에요.",
      "물러설 수 없습니다. 이 구역은 제가 맡았으니까요.",
      "당황하지 않겠습니다. 매뉴얼대로 대응합니다."
    ]
  },
  {
    "characterId": "chr_baui",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "…좋은 소식이네요. 조용히 기뻐하겠습니다.",
      "원고를 다듬듯",
      "이 성과도 차분히 정리해 두죠."
    ]
  },
  {
    "characterId": "chr_baui",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "…괜찮아요. 밤새워 고치면 되니까요.",
      "오탈자를 잡듯",
      "문제도 하나씩 짚어 나가죠."
    ]
  },
  {
    "characterId": "chr_baair",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 소식이네요. 오늘 오시는 분들께 서비스 드려야겠어요.",
      "따뜻한 하루예요. 단골분들도 기뻐하시겠죠?",
      "이런 날은 커피 향이 유난히 좋게 느껴져요."
    ]
  },
  {
    "characterId": "chr_baair",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "힘든 날이지만",
      "따뜻한 한 잔이면 견딜 수 있어요.",
      "괜찮아요. 손님 한 분 한 분 챙기다 보면 지나가요."
    ]
  },
  {
    "characterId": "chr_bamine",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "임상 데이터가 좋게 나왔어요. 이럴 때 눈빛이 바뀌죠.",
      "수치가 유의미합니다. 다음 상을 준비하죠.",
      "데이터가 옳았어요. 연구는 거짓말을 안 하니까요."
    ]
  },
  {
    "characterId": "chr_bamine",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "실패한 데이터도 데이터예요. 다시 설계하죠.",
      "파이프라인 하나 접혔다고 멈추진 않아요. 다음 후보로.",
      "감정보다 근거예요. 원인부터 규명하겠습니다."
    ]
  },
  {
    "characterId": "chr_batrg",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "정의가 이겼군! 수리비는… 나중에 생각하자!",
      "좋아",
      "악을 물리쳤으면 된 거다! 출동 보람 있었어!"
    ]
  },
  {
    "characterId": "chr_batrg",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "견적? 그런 건 나중이다! 지금은 출동이 먼저야!",
      "정의 앞에 후퇴는 없다! 부서진 건 나중에 고치지!",
      "쓰러져도 다시 선다! 그게 정의의 대장이니까!"
    ]
  },
  {
    "characterId": "chr_bamari",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 소식이네요. 여정이 순탄할 것 같아요.",
      "여행자분들도 기뻐하시겠죠. 저도 마음이 놓여요.",
      "이런 날의 풍경은 유난히 아름답게 보여요."
    ]
  },
  {
    "characterId": "chr_bamari",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "길이 험해도 안내는 계속됩니다. 걱정 마세요.",
      "흐린 날의 순례도 나름의 의미가 있는 법이죠.",
      "당황하지 않을게요. 여행자분들 마음부터 살피겠습니다."
    ]
  },
  {
    "characterId": "chr_batrb",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "어머",
      "근사한 소식이네요. 오늘 티파티는 축배로 할까요.",
      "후훗"
    ]
  },
  {
    "characterId": "chr_batrb",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "어머 이런. 하지만 제 변덕은 이 정도로 안 끝나요.",
      "흠",
      "조금 흐려졌네요. 곧 다시 화사하게 만들죠."
    ]
  },
  {
    "characterId": "chr_wwjin",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 결과군요. 하지만 여기서 결단을 늦추진 않겠습니다.",
      "온화하게 받아들이되",
      "다음 수는 이미 두고 있어요."
    ]
  },
  {
    "characterId": "chr_wwjin",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "흔들림은 잠시입니다. 결단은 누구보다 빠르게 내리죠.",
      "침착하게",
      "그러나 단호하게 방향을 잡겠습니다."
    ]
  },
  {
    "characterId": "chr_wwchl",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "불꽃처럼 번지는 흐름이군. 판은 내가 설계한 대로다.",
      "좋은 결과다. 하지만 이건 큰 그림의 한 수에 불과해.",
      "통찰이 맞아떨어졌군. 다음 판도 이미 보인다."
    ]
  },
  {
    "characterId": "chr_wwchl",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "불이 꺼진 게 아니야. 다시 지피면 그만이지.",
      "판이 흔들려도 설계도는 내 손에 있다. 침착하게.",
      "위기는 전략가에겐 재료일 뿐. 판을 다시 짜지."
    ]
  },
  {
    "characterId": "chr_wwxly",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "실험 성공이에요. 밤을 새운 보람이 있네요.",
      "데이터가 예쁘게 나왔어요. 이래서 연구를 멈출 수 없죠.",
      "가설이 맞았어요. 다음 실험도 바로 시작할래요."
    ]
  },
  {
    "characterId": "chr_wwxly",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "실패도 데이터예요. 변수만 바꿔서 다시 돌리죠.",
      "밤낮이 무슨 상관인가요. 될 때까지 실험할 뿐이에요.",
      "이 오류"
    ]
  },
  {
    "characterId": "chr_wwjyn",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "화물은 무사히 도착했습니다. 그거면 됐죠.",
      "악천후에도 항로를 지켰습니다. 좋은 결과네요.",
      "청룡의 이름을 걸었으니"
    ]
  },
  {
    "characterId": "chr_wwjyn",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "폭풍이 와도 화물은 반드시 도착시킵니다. 걱정 마세요.",
      "항로가 험해도 기장은 조종간을 놓지 않습니다.",
      "악천후는 늘 있는 일. 침착하게 고도를 잡죠."
    ]
  },
  {
    "characterId": "chr_wwskp",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "…네트워크는 조용합니다. 그게 가장 좋은 소식이죠.",
      "등대처럼",
      "저는 그저 제자리를 지켰을 뿐입니다."
    ]
  },
  {
    "characterId": "chr_wwskp",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "…신호가 끊겼군요. 조용히 복구하겠습니다.",
      "소란 떨 것 없어요. 회선을 다시 이으면 됩니다.",
      "어둠 속에서도 불빛은 지킵니다. 그게 제 일이에요."
    ]
  },
  {
    "characterId": "chr_wwcam",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "어머",
      "예쁘게 피었네요. 이런 결과는 향기롭죠.",
      "후훗"
    ]
  },
  {
    "characterId": "chr_wwcam",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "꽃이 졌다고 슬퍼 마세요. 다시 피우면 되니까요.",
      "어머",
      "조금 위험해졌네요. 그래서 더 재밌잖아요?"
    ]
  },
  {
    "characterId": "chr_nkltr",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "좋은 결과네요. 이 기세면 하루 만에 더 올리죠.",
      "설계대로 완공. 이런 소식이 제일 뿌듯해요.",
      "다음 현장도 바로 착공할까요. 쉴 틈이 없네요."
    ]
  },
  {
    "characterId": "chr_nkltr",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "무너졌으면 다시 세우죠. 그게 제 일이니까요.",
      "잔해부터 정리하고 설계를 다시 그리겠습니다.",
      "밤을 새워서라도 복구합니다. 도면은 제 손에 있어요."
    ]
  },
  {
    "characterId": "chr_nkvol",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "시청률 대박이에요! 이런 그림을 원했다고요!",
      "카메라 잘 돌렸네요. 오늘 방송은 레전드예요!",
      "반응 폭발! 다음 특집도 기대해 주세요"
    ]
  },
  {
    "characterId": "chr_nkvol",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "컷! …편집으로 살릴 수 있어요. 걱정 마세요.",
      "시청률 떨어져도 다음 아이템으로 뒤집으면 되죠.",
      "방송 사고도 콘텐츠예요! 이걸로 특집 하나 만들죠!"
    ]
  },
  {
    "characterId": "chr_nkneo",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "매출 좋아요! 이럴 때 신상 좀 들여놔야겠어요.",
      "대박이에요! …이 김에 저 물건도 사도 될까요?",
      "잘 팔렸으니 저도 기분 좋게 지갑… 아니"
    ]
  },
  {
    "characterId": "chr_nkneo",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "좀 안 팔렸네요. 그래도 좋아하는 건 못 놓겠어요.",
      "매출 부진해도 진열은 예쁘게! 그게 제 원칙이에요.",
      "괜찮아요"
    ]
  },
  {
    "characterId": "chr_nkexa",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "랭킹 1위 갱신! 밤새운 보람이 있네요.",
      "이번 판",
      "완승이에요. 다음 시즌도 정상 사수합니다."
    ]
  },
  {
    "characterId": "chr_nkexa",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "한 판 졌다고 접나요? 리트라이하면 되죠.",
      "패배도 리플레이 분석하면 다음 승리의 재료예요.",
      "랭킹 떨어졌네요… 오늘 밤도 새우면 되겠어요."
    ]
  },
  {
    "characterId": "chr_aeyvn",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "공정 수율이 목표를 넘었어요. 다음 노드로 바로 넘어가죠.",
      "설계가 맞아떨어졌네요. 밤샘한 보람이 있어요.",
      "이 칩"
    ]
  },
  {
    "characterId": "chr_aeyvn",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "수율이 흔들렸네요. 원인 웨이퍼부터 다시 봅니다.",
      "실패한 공정도 데이터예요. 재설계하죠.",
      "지연은 있어도 후퇴는 없어요. 다시 돌립니다."
    ]
  },
  {
    "characterId": "chr_nkilg",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "전력망이 안정적입니다. 그게 최고의 실적이죠.",
      "정전 없는 하루",
      "그거면 충분합니다."
    ]
  },
  {
    "characterId": "chr_nkilg",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "부하가 몰렸지만 예비 전력으로 버팁니다.",
      "불이 꺼지지 않게 하는 게 제 일입니다. 복구하죠.",
      "당황하지 않고 계통부터 안정시키겠습니다."
    ]
  },
  {
    "characterId": "chr_aegil",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "새 합금이 규격을 통과했어요. 산업이 바뀔 겁니다.",
      "데이터가 옳았네요. 다음 배합으로 가죠.",
      "기초 소재가 튼튼해야 위가 산다니까요."
    ]
  },
  {
    "characterId": "chr_aegil",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "배합이 틀어졌네요. 처음부터 다시 계산합니다.",
      "실패한 시료도 결과예요. 원인을 파헤치죠.",
      "납기는 늦어도 품질은 못 타협합니다."
    ]
  },
  {
    "characterId": "chr_wwlne",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "신차 반응 폭발이네요. 다음 라인업도 기대하세요.",
      "직접 몰아보고 다듬은 값어치가 나왔어요.",
      "길 위에서 증명했으니 됐죠."
    ]
  },
  {
    "characterId": "chr_wwlne",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "리콜? 안전이 먼저니 바로 잡습니다.",
      "이번 모델은 아쉽지만 다음 세대로 뒤집죠.",
      "멈춰 섰다고 끝은 아니에요. 다시 달립니다."
    ]
  },
  {
    "characterId": "chr_ersua",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "손해율이 안정적이에요. 계산대로입니다.",
      "가입자분들을 잘 지켜냈다면 그걸로 됐죠.",
      "리스크를 미리 읽은 보람이 있네요."
    ]
  },
  {
    "characterId": "chr_ersua",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "대형 청구가 들어왔지만 준비금으로 감당합니다.",
      "최악을 가정해 둔 게 이럴 때 빛나죠.",
      "약속은 지킵니다. 그게 보험이니까요."
    ]
  },
  {
    "characterId": "chr_nkmna",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "고객사 칩을 완벽한 수율로 뽑았어요. 신뢰가 곧 수주죠.",
      "증설이 제때 돌아갔네요. 물량은 저희가 책임집니다.",
      "설계는 그쪽이"
    ]
  },
  {
    "characterId": "chr_nkmna",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "수율이 흔들렸지만 라인을 다시 잡습니다.",
      "증설이 늦어도 납기는 지켜냅니다.",
      "고객 신뢰가 생명이에요. 원인부터 바로잡죠."
    ]
  },
  {
    "characterId": "chr_wwmne",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "슈퍼사이클이 왔어요! 지금이 메모리의 계절이죠.",
      "가격이 치솟네요. 이 파도",
      "제대로 타봅시다."
    ]
  },
  {
    "characterId": "chr_wwmne",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "치킨게임이네요. 버티는 놈이 이깁니다.",
      "가격 폭락? 사이클은 돌아요. 다음 상승을 준비하죠.",
      "적자 구간이지만 감산으로 버팁니다."
    ]
  },
  {
    "characterId": "chr_wwlcl",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "설계부터 생산까지 다 쥐고 있으니 흔들림이 없죠.",
      "신형 코어가 벤치를 갈아치웠어요.",
      "종합반도체의 저력을 실적으로 보였네요."
    ]
  },
  {
    "characterId": "chr_wwlcl",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "공정 전환이 늦었네요. 로드맵을 다시 짭니다.",
      "경쟁사에 밀렸지만 다음 세대로 뒤집죠.",
      "성숙한 회사는 이런 걸로 안 흔들려요. 차분히."
    ]
  },
  {
    "characterId": "chr_nkccl",
    "tag": "*",
    "direction": "positive",
    "quotes": [
      "EUV 주문이 밀렸어요. 저희 없인 미세공정도 없죠.",
      "장비 한 대에 팹 하나가 걸려 있으니까요.",
      "누가 이기든"
    ]
  },
  {
    "characterId": "chr_nkccl",
    "tag": "*",
    "direction": "negative",
    "quotes": [
      "납기가 밀렸네요. 정밀 조정에 시간이 필요해요.",
      "수출 규제요? 그래도 기술 우위는 저희 겁니다.",
      "한 대 한 대가 예술이라 서두를 순 없어요."
    ]
  }
];
