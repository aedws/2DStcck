/**
 * 마이룸 — 게임 재화 소비처(sink).
 * 가구를 사서 격자 방에 배치한다. 되팔면 구매가의 50%만 돌려받아
 * 배치·재배치를 반복할수록 재화가 소각된다. 순자산·랭킹에는 합산하지 않는다.
 */

export const ROOM_GRID_COLS = 16;
export const ROOM_GRID_ROWS = 12;
/** 위쪽 2줄은 벽 — 벽걸이 장식 전용, 나머지는 바닥. */
export const ROOM_WALL_ROWS = 2;
/** 아래쪽 3줄은 욕실 구역(타일 바닥) — 배치 규칙은 바닥과 동일, 시각만 다르다. */
export const ROOM_BATH_ROWS = 3;
/** 숙소와 욕탕 사이 고정 출입문 너비(격자 칸). */
export const ROOM_BATH_DOOR_WIDTH = 2;
/** 되팔기 환불 비율. 나머지는 소각된다. */
export const ROOM_SELL_RATIO = 0.5;
/** 기본 방에 놓을 수 있는 최대 가구 수 (저장 용량 보호). */
export const ROOM_MAX_ITEMS = 80;

/** 방 크기 확장권 — 단계별 1회 구매(환불 없음)로 격자가 커진다. */
export interface RoomExpansion {
  level: number;
  name: string;
  cols: number;
  rows: number;
  /** 이 단계로 올라가는 확장권 가격(센트). level 0은 기본 제공. */
  price: number;
}

export const ROOM_EXPANSIONS: RoomExpansion[] = [
  { level: 0, name: "기본 숙소", cols: 16, rows: 12, price: 0 },
  { level: 1, name: "넓은 숙소", cols: 18, rows: 13, price: 1_000_000_000 },
  { level: 2, name: "별관 증축", cols: 20, rows: 14, price: 10_000_000_000 },
  { level: 3, name: "대욕장", cols: 22, rows: 16, price: 200_000_000_000 },
  { level: 4, name: "펜트하우스", cols: 26, rows: 18, price: 5_000_000_000_000 },
  { level: 5, name: "대저택 홀", cols: 30, rows: 20, price: 100_000_000_000_000 },
];

/**
 * 숙소 테마(도배) — 벽지·바닥·욕실 타일 팔레트를 통째로 바꾼다.
 * 소녀전선·벽람항로 기숙사처럼 방의 분위기를 스킨으로 수집하는 소비처.
 */
export interface RoomTheme {
  id: string;
  name: string;
  emoji: string;
  /** 구매 가격(센트). 0이면 기본 제공. */
  price: number;
  description: string;
  palette: {
    frame: string;
    wallFrom: string;
    wallTo: string;
    floorA: string;
    floorB: string;
    bathA: string;
    bathB: string;
    divider: string;
  };
}

export const ROOM_THEMES: RoomTheme[] = [
  {
    id: "onsen",
    name: "파스텔 온천장",
    emoji: "♨️",
    price: 0,
    description: "기본 제공되는 분홍 목욕탕 무드.",
    palette: {
      frame: "#f9a8d4",
      wallFrom: "#f9a8d4",
      wallTo: "#fbcfe8",
      floorA: "#ffffff",
      floorB: "#fdf2f8",
      bathA: "#cffafe",
      bathB: "#a5f3fc",
      divider: "#f472b6",
    },
  },
  {
    id: "commander",
    name: "지휘관 기숙사",
    emoji: "🎖️",
    price: 10_000_000_000,
    description: "우드 톤과 카키가 섞인 든든한 기숙사 무드.",
    palette: {
      frame: "#92400e",
      wallFrom: "#b45309",
      wallTo: "#d97706",
      floorA: "#fef3c7",
      floorB: "#fde68a",
      bathA: "#e0f2fe",
      bathB: "#bae6fd",
      divider: "#b45309",
    },
  },
  {
    id: "port",
    name: "군항 라운지",
    emoji: "⚓",
    price: 10_000_000_000,
    description: "네이비·화이트의 시원한 항구 라운지 무드.",
    palette: {
      frame: "#1e3a8a",
      wallFrom: "#1d4ed8",
      wallTo: "#3b82f6",
      floorA: "#eff6ff",
      floorB: "#dbeafe",
      bathA: "#cffafe",
      bathB: "#67e8f9",
      divider: "#1d4ed8",
    },
  },
  {
    id: "sakura",
    name: "벚꽃 온천",
    emoji: "🌸",
    price: 50_000_000_000,
    description: "꽃잎 흩날리는 노천탕 무드.",
    palette: {
      frame: "#db2777",
      wallFrom: "#f472b6",
      wallTo: "#f9a8d4",
      floorA: "#fff1f2",
      floorB: "#ffe4e6",
      bathA: "#fce7f3",
      bathB: "#fbcfe8",
      divider: "#db2777",
    },
  },
  {
    id: "midnight",
    name: "심야 스위트",
    emoji: "🌙",
    price: 200_000_000_000,
    description: "네온이 은은한 심야 펜트하우스 무드.",
    palette: {
      frame: "#4c1d95",
      wallFrom: "#312e81",
      wallTo: "#4c1d95",
      floorA: "#1e1b4b",
      floorB: "#312e81",
      bathA: "#164e63",
      bathB: "#155e75",
      divider: "#7c3aed",
    },
  },
];

export const ROOM_THEME_BY_ID = new Map(ROOM_THEMES.map((theme) => [theme.id, theme]));
export const DEFAULT_ROOM_THEME_ID = "onsen";

export function getRoomTheme(id: string | undefined): RoomTheme {
  return (id && ROOM_THEME_BY_ID.get(id)) || ROOM_THEMES[0];
}

export function normalizeRoomThemeId(value: unknown): string {
  return typeof value === "string" && ROOM_THEME_BY_ID.has(value)
    ? value
    : DEFAULT_ROOM_THEME_ID;
}

export function normalizeOwnedRoomThemes(value: unknown): string[] {
  const owned = new Set<string>([DEFAULT_ROOM_THEME_ID]);
  if (Array.isArray(value)) {
    for (const id of value) {
      if (typeof id === "string" && ROOM_THEME_BY_ID.has(id)) owned.add(id);
    }
  }
  return [...owned];
}

/** 이 행이 욕실 구역인가 (아래쪽 ROOM_BATH_ROWS줄). */
export function isBathRow(y: number, rows: number): boolean {
  return y >= rows - ROOM_BATH_ROWS;
}

/** 욕탕이 시작되는 행. 이 행의 위쪽 경계에 고정 벽과 출입문이 놓인다. */
export function roomBathStartRow(rows: number): number {
  return rows - ROOM_BATH_ROWS;
}

/** 방 크기가 달라져도 중앙에 유지되는 욕탕 양문형 출입구의 열 목록. */
export function roomBathDoorColumns(cols: number): number[] {
  const first = Math.max(0, Math.floor((cols - ROOM_BATH_DOOR_WIDTH) / 2));
  return Array.from(
    { length: Math.min(ROOM_BATH_DOOR_WIDTH, cols) },
    (_, offset) => first + offset,
  );
}

/** 경계문 바로 앞뒤의 통로 칸. 새 가구를 놓지 않아 문이 항상 열려 있게 한다. */
export function isRoomBathPassageCell(
  x: number,
  y: number,
  level: number = 0,
): boolean {
  const { cols, rows } = roomDimsForLevel(level);
  const bathStart = roomBathStartRow(rows);
  return (
    roomBathDoorColumns(cols).includes(x) &&
    (y === bathStart - 1 || y === bathStart)
  );
}

/** 뒷벽 출입문 위치(벽 아래줄 고정). 이 칸엔 가구를 걸 수 없다. */
export const ROOM_DOOR_X = 2;
export const ROOM_DOOR_Y = ROOM_WALL_ROWS - 1;

export function normalizeRoomLevel(value: unknown): number {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 0) return 0;
  return Math.min(level, ROOM_EXPANSIONS.length - 1);
}

export function roomDimsForLevel(level: number): { cols: number; rows: number } {
  const expansion = ROOM_EXPANSIONS[normalizeRoomLevel(level)];
  return { cols: expansion.cols, rows: expansion.rows };
}

export function roomMaxItemsForLevel(level: number): number {
  return ROOM_MAX_ITEMS + normalizeRoomLevel(level) * 30;
}

export function nextRoomExpansion(level: number): RoomExpansion | undefined {
  return ROOM_EXPANSIONS[normalizeRoomLevel(level) + 1];
}

export type RoomItemCategory = "가구" | "욕실" | "장식" | "펫" | "프리미엄";
export type RoomItemLayer = "floor" | "furniture" | "surface" | "wall";
export type RoomRotation = 0 | 90;

export interface RoomItemDefinition {
  id: string;
  name: string;
  emoji: string;
  category: RoomItemCategory;
  /** 벽 전용 아이템(위쪽 벽 줄에만 배치 가능). */
  wallOnly?: boolean;
  /** 다칸 가구의 기본 점유 크기. 기존 가구는 1×1. */
  width?: number;
  height?: number;
  rotatable?: boolean;
  /** 러그·가구·탁상 소품을 같은 칸에 겹쳐 놓기 위한 배치 층. */
  layer?: RoomItemLayer;
  /** 탁상 소품처럼 아래 가구가 있어야 하는 아이템. */
  requiresSupport?: boolean;
  /** 분위기·세트·상호작용 계산용 태그. */
  tags?: string[];
  interaction?: string;
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
  { id: "cozy-rug", name: "포근한 대형 러그", emoji: "🟫", category: "장식", price: 24_000_000, description: "가구 아래에도 깔 수 있는 3×2 러그.", width: 3, height: 2, rotatable: true, layer: "floor", tags: ["아늑함", "기숙사"] },
  { id: "tea-set", name: "애프터눈 티 세트", emoji: "🫖", category: "장식", price: 16_000_000, description: "테이블 위에 올리는 작은 티 세트.", layer: "surface", requiresSupport: true, tags: ["아늑함"], interaction: "찻잔에서 따뜻한 김이 피어오릅니다." },

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
  { id: "private-theater", name: "개인 극장", emoji: "🎞️", category: "프리미엄", price: 500_000_000_000_000, description: "4×3 크기의 독립 상영관.", width: 4, height: 3, rotatable: true, tags: ["고급", "문화"], interaction: "오늘의 시장 다큐멘터리가 상영됩니다." },
  { id: "trading-desk", name: "월스트리트 거래실", emoji: "🖥️", category: "프리미엄", price: 1_000_000_000_000_000, description: "4×2 멀티 모니터 거래실.", width: 4, height: 2, rotatable: true, tags: ["투자광", "고급"], interaction: "모니터에 실시간 호가와 뉴스가 흐릅니다." },
  { id: "indoor-pool", name: "실내 인피니티 풀", emoji: "🏊", category: "프리미엄", price: 5_000_000_000_000_000, description: "5×3 크기의 대저택 수영장.", width: 5, height: 3, rotatable: true, tags: ["고급", "온천"], interaction: "수면 위로 잔잔한 물결이 번집니다." },
  { id: "rooftop-garden", name: "옥상 정원", emoji: "🌳", category: "프리미엄", price: 10_000_000_000_000_000, description: "5×3 규모의 개인 정원.", width: 5, height: 3, rotatable: true, tags: ["자연", "고급"], interaction: "바람에 나뭇잎이 사각거립니다." },
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
  rotation?: RoomRotation;
}

export function roomItemLayer(item: RoomItemDefinition): RoomItemLayer {
  if (item.wallOnly) return "wall";
  return item.layer ?? "furniture";
}

export function roomItemSize(
  item: RoomItemDefinition,
  rotation: RoomRotation = 0,
): { width: number; height: number } {
  const width = Math.max(1, Math.floor(item.width ?? 1));
  const height = Math.max(1, Math.floor(item.height ?? 1));
  return rotation === 90 ? { width: height, height: width } : { width, height };
}

export function roomItemCells(
  item: RoomItemDefinition,
  x: number,
  y: number,
  rotation: RoomRotation = 0,
): { x: number; y: number }[] {
  const size = roomItemSize(item, rotation);
  return Array.from({ length: size.height }).flatMap((_, dy) =>
    Array.from({ length: size.width }, (__, dx) => ({ x: x + dx, y: y + dy })),
  );
}

export function isValidRoomPlacement(
  item: RoomItemDefinition,
  x: number,
  y: number,
  level: number = 0,
  rotation: RoomRotation = 0,
): boolean {
  const dims = roomDimsForLevel(level);
  const cells = roomItemCells(item, x, y, rotation);
  return cells.every((cell) => {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return false;
    if (cell.x < 0 || cell.x >= dims.cols || cell.y < 0 || cell.y >= dims.rows) return false;
    if (cell.x === ROOM_DOOR_X && cell.y === ROOM_DOOR_Y) return false;
    if (isRoomBathPassageCell(cell.x, cell.y, level)) return false;
    return item.wallOnly ? isWallRow(cell.y) : !isWallRow(cell.y);
  });
}

export function isWallRow(y: number): boolean {
  return y < ROOM_WALL_ROWS;
}

/** 배치 가능 여부(격자 범위·벽/바닥 규칙). 점유 검사는 호출부가 한다. */
export function isValidRoomCell(
  item: RoomItemDefinition,
  x: number,
  y: number,
  level: number = 0,
): boolean {
  return isValidRoomPlacement(item, x, y, level, 0);
}

/** 저장 복원용 정규화 — 알 수 없는 아이템·범위 밖·중복 칸을 걷어낸다. */
export function normalizeRoomItems(
  value: unknown,
  level: number = ROOM_EXPANSIONS.length - 1,
): PlacedRoomItem[] {
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
    const rotation: RoomRotation = entry.rotation === 90 && item.rotatable ? 90 : 0;
    if (!isValidRoomPlacement(item, x, y, level, rotation)) continue;
    const layer = roomItemLayer(item);
    const cells = roomItemCells(item, x, y, rotation);
    const keys = cells.map((cell) => `${layer}:${cell.x}:${cell.y}`);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    result.push({
      itemId: item.id,
      x,
      y,
      paidPrice:
        Number.isFinite(entry.paidPrice) && entry.paidPrice! >= 0
          ? Math.round(entry.paidPrice!)
          : item.price,
      purchasedAt: Number.isFinite(entry.purchasedAt) ? entry.purchasedAt! : 0,
      rotation,
    });
    if (result.length >= roomMaxItemsForLevel(level)) break;
  }
  return result.filter((placed) => {
    const item = getRoomItem(placed.itemId);
    if (!item?.requiresSupport) return true;
    const keys = new Set(
      roomItemCells(item, placed.x, placed.y, placed.rotation ?? 0).map(
        (cell) => `${cell.x}:${cell.y}`,
      ),
    );
    return result.some((otherPlaced) => {
      const other = getRoomItem(otherPlaced.itemId);
      return (
        Boolean(other) &&
        roomItemLayer(other!) === "furniture" &&
        roomItemCells(
          other!,
          otherPlaced.x,
          otherPlaced.y,
          otherPlaced.rotation ?? 0,
        ).some((cell) => keys.has(`${cell.x}:${cell.y}`))
      );
    });
  });
}
