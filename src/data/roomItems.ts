/**
 * 마이룸 — 게임 재화 소비처(sink).
 * 가구를 사서 격자 방에 배치한다. 되팔면 구매가의 50%만 돌려받아
 * 배치·재배치를 반복할수록 재화가 소각된다. 순자산·랭킹에는 합산하지 않는다.
 */

export const ROOM_GRID_COLS = 10;
export const ROOM_GRID_ROWS = 8;
/** 위쪽 2줄은 벽 — 벽걸이 장식 전용, 나머지는 바닥. */
export const ROOM_WALL_ROWS = 2;
/** 되팔기 환불 비율. 나머지는 소각된다. */
export const ROOM_SELL_RATIO = 0.5;
/** 방에 놓을 수 있는 최대 가구 수 (저장 용량 보호). */
export const ROOM_MAX_ITEMS = 60;

export type RoomItemCategory = "가구" | "욕실" | "장식" | "펫" | "프리미엄";

export interface RoomItemDefinition {
  id: string;
  name: string;
  emoji: string;
  category: RoomItemCategory;
  /** 벽 전용 아이템(위쪽 벽 줄에만 배치 가능). */
  wallOnly?: boolean;
  /** 가격(센트). */
  price: number;
  description: string;
}

export const ROOM_ITEMS: RoomItemDefinition[] = [
  // ── 가구 — 입문 소비 ──
  { id: "stool", name: "동글 스툴", emoji: "🪑", category: "가구", price: 5_000_000, description: "어디에나 어울리는 파스텔 스툴." },
  { id: "table", name: "찻상 테이블", emoji: "🛋️", category: "가구", price: 12_000_000, description: "손님 접대용 아담한 테이블." },
  { id: "bed", name: "구름 침대", emoji: "🛏️", category: "가구", price: 25_000_000, description: "구름 위에서 자는 기분." },
  { id: "bookshelf", name: "책장", emoji: "📚", category: "가구", price: 18_000_000, description: "투자 서적으로 가득한 책장." },
  { id: "tv", name: "레트로 TV", emoji: "📺", category: "가구", wallOnly: false, price: 30_000_000, description: "시세 채널이 종일 나온다." },
  { id: "piano", name: "그랜드 피아노", emoji: "🎹", category: "가구", price: 80_000_000, description: "수익 실현의 세레나데." },

  // ── 욕실 — 목욕탕 감성 ──
  { id: "duck", name: "러버덕", emoji: "🐥", category: "욕실", price: 5_000_000, description: "탕에 띄우는 필수템." },
  { id: "bath", name: "온천 욕조", emoji: "🛁", category: "욕실", price: 40_000_000, description: "김이 모락모락 나는 1인탕." },
  { id: "shower", name: "샤워 부스", emoji: "🚿", category: "욕실", price: 22_000_000, description: "장 마감 후 개운하게." },
  { id: "sauna", name: "찜질 스토브", emoji: "🔥", category: "욕실", price: 55_000_000, description: "한증막의 심장. 화상 주의." },
  { id: "towel", name: "수건 선반", emoji: "🧺", category: "욕실", price: 8_000_000, description: "보송보송 수건이 한가득." },

  // ── 장식 ──
  { id: "plant", name: "몬스테라 화분", emoji: "🪴", category: "장식", price: 7_000_000, description: "초록이 있으면 수익률도 초록." },
  { id: "clock", name: "벽시계", emoji: "🕐", category: "장식", wallOnly: true, price: 9_000_000, description: "개장 시간을 알려주는 벽시계." },
  { id: "painting", name: "명화 액자", emoji: "🖼️", category: "장식", wallOnly: true, price: 35_000_000, description: "어디서 본 듯한 명화." },
  { id: "window", name: "바다 전망 창", emoji: "🪟", category: "장식", wallOnly: true, price: 28_000_000, description: "창밖은 언제나 상한가 노을." },
  { id: "lamp", name: "달빛 램프", emoji: "🪔", category: "장식", price: 11_000_000, description: "은은한 야간 거래용 조명." },
  { id: "flower", name: "꽃병", emoji: "💐", category: "장식", price: 6_000_000, description: "축하 인사 대신 놓는 꽃." },

  // ── 펫 ──
  { id: "cat", name: "노랑 고양이", emoji: "🐱", category: "펫", price: 100_000_000, description: "방을 어슬렁거리는 집사장." },
  { id: "panda", name: "탕속 판다", emoji: "🐼", category: "펫", price: 150_000_000, description: "온탕을 독점하는 판다." },
  { id: "penguin", name: "냉탕 펭귄", emoji: "🐧", category: "펫", price: 150_000_000, description: "냉탕 지박령." },
  { id: "goldfish", name: "금붕어 어항", emoji: "🐠", category: "펫", price: 60_000_000, description: "물멍 전용 어항." },

  // ── 프리미엄 — 고래용 sink ──
  { id: "gold-bath", name: "황금 욕조", emoji: "👑", category: "프리미엄", price: 10_000_000_000, description: "순금 24K 욕조. 물도 금빛." },
  { id: "fountain", name: "대리석 분수", emoji: "⛲", category: "프리미엄", price: 50_000_000_000, description: "방 안에 분수를 두는 재력." },
  { id: "ufo", name: "전용 UFO", emoji: "🛸", category: "프리미엄", price: 1_000_000_000_000, description: "천장에 대기 중인 개인 비행체." },
  { id: "aurora", name: "오로라 천장", emoji: "🌌", category: "프리미엄", wallOnly: true, price: 20_000_000_000_000, description: "벽 너머로 오로라가 흐른다." },
  { id: "whale", name: "황금 고래상", emoji: "🐋", category: "프리미엄", price: 100_000_000_000_000, description: "시장의 큰손임을 증명하는 상징물." },
];

export const ROOM_ITEM_BY_ID = new Map(ROOM_ITEMS.map((item) => [item.id, item]));

export function getRoomItem(id: string): RoomItemDefinition | undefined {
  return ROOM_ITEM_BY_ID.get(id);
}

export interface PlacedRoomItem {
  itemId: string;
  x: number;
  y: number;
  /** 구매 당시 가격(센트) — 되팔기 환불 기준. */
  paidPrice: number;
  purchasedAt: number;
}

export function isWallRow(y: number): boolean {
  return y < ROOM_WALL_ROWS;
}

/** 배치 가능 여부(격자 범위·벽/바닥 규칙). 점유 검사는 호출부가 한다. */
export function isValidRoomCell(item: RoomItemDefinition, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= ROOM_GRID_COLS || y < 0 || y >= ROOM_GRID_ROWS) return false;
  if (item.wallOnly) return isWallRow(y);
  return !isWallRow(y);
}

/** 저장 복원용 정규화 — 알 수 없는 아이템·범위 밖·중복 칸을 걷어낸다. */
export function normalizeRoomItems(value: unknown): PlacedRoomItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: PlacedRoomItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<PlacedRoomItem>;
    const item = typeof entry.itemId === "string" ? getRoomItem(entry.itemId) : undefined;
    if (!item) continue;
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!isValidRoomCell(item, x, y)) continue;
    const cell = `${x}:${y}`;
    if (seen.has(cell)) continue;
    seen.add(cell);
    result.push({
      itemId: item.id,
      x,
      y,
      paidPrice:
        Number.isFinite(entry.paidPrice) && entry.paidPrice! >= 0
          ? Math.round(entry.paidPrice!)
          : item.price,
      purchasedAt: Number.isFinite(entry.purchasedAt) ? entry.purchasedAt! : 0,
    });
    if (result.length >= ROOM_MAX_ITEMS) break;
  }
  return result;
}
