import assert from "node:assert";
import {
  ROOM_ITEMS,
  getRoomItem,
  isRoomBathPassageCell,
  isValidRoomPlacement,
  normalizeRoomItems,
  roomItemCells,
  roomItemLayer,
  roomItemSize,
} from "../src/data/roomItems";

const theater = getRoomItem("private-theater")!;
assert.deepEqual(roomItemSize(theater, 0), { width: 4, height: 3 });
assert.deepEqual(roomItemSize(theater, 90), { width: 3, height: 4 });
assert.equal(roomItemCells(theater, 4, 4, 0).length, 12);
assert.equal(isValidRoomPlacement(theater, 4, 4, 0, 0), true);
assert.equal(isValidRoomPlacement(theater, 14, 4, 0, 0), false);

const rug = getRoomItem("cozy-rug")!;
assert.equal(roomItemLayer(rug), "floor");
assert.equal(roomItemLayer(getRoomItem("bed")!), "furniture");
assert.equal(roomItemLayer(getRoomItem("clock")!), "wall");

// 중앙 욕탕 출입문 앞뒤는 다칸 가구도 침범할 수 없다.
const passage = roomItemCells(rug, 7, 8, 0).some((cell) =>
  isRoomBathPassageCell(cell.x, cell.y, 0),
);
if (passage) assert.equal(isValidRoomPlacement(rug, 7, 8, 0, 0), false);

const now = 1234;
const normalized = normalizeRoomItems(
  [
    { itemId: "cozy-rug", x: 3, y: 3, paidPrice: rug.price, purchasedAt: now },
    { itemId: "bed", x: 3, y: 3, paidPrice: 1, purchasedAt: now + 1 },
    // 같은 furniture 층 중복은 제거한다.
    { itemId: "table", x: 3, y: 3, paidPrice: 1, purchasedAt: now + 2 },
  ],
  0,
);
assert.equal(normalized.length, 2);
assert.ok(normalized.some((item) => item.itemId === "cozy-rug"));
assert.ok(normalized.some((item) => item.itemId === "bed"));

const supportedSurface = normalizeRoomItems(
  [
    { itemId: "tea-set", x: 5, y: 4, paidPrice: 1, purchasedAt: now + 3 },
    { itemId: "table", x: 5, y: 4, paidPrice: 1, purchasedAt: now + 4 },
  ],
  0,
);
assert.equal(supportedSurface.length, 2);
const floatingSurface = normalizeRoomItems(
  [{ itemId: "tea-set", x: 5, y: 4, paidPrice: 1, purchasedAt: now + 5 }],
  0,
);
assert.equal(floatingSurface.length, 0);

// 기존 1×1 저장 데이터는 회전 필드가 없어도 그대로 복원한다.
const legacy = normalizeRoomItems(
  [{ itemId: "plant", x: 1, y: 3, paidPrice: 7_000_000, purchasedAt: 1 }],
  0,
);
assert.equal(legacy.length, 1);
assert.equal(legacy[0].rotation, 0);
assert.ok(ROOM_ITEMS.length >= 30);

console.log("myroom footprint, layer, rotation & legacy scenarios passed");
