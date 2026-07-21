export interface AxisAlignedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SweptCircleHit {
  /** 이동 구간에서 충돌한 비율. 0은 시작점, 1은 끝점이다. */
  time: number;
  normalX: -1 | 0 | 1;
  normalY: -1 | 0 | 1;
  /** 이미 블록 안에 들어간 공을 안전한 경계로 꺼낼 때 사용한다. */
  correctedX: number;
  correctedY: number;
  startedInside: boolean;
}

const EPSILON = 1e-9;

/**
 * 원을 반지름만큼 확장한 AABB를 향해 움직이는 점으로 바꿔 연속 충돌을 계산한다.
 * 끝점만 검사하지 않으므로 한 프레임에 블록을 완전히 지나가는 고속 공도 잡힌다.
 */
export function sweepCircleAgainstRect(
  startX: number,
  startY: number,
  deltaX: number,
  deltaY: number,
  radius: number,
  rect: AxisAlignedRect,
): SweptCircleHit | null {
  const left = rect.left - radius;
  const right = rect.right + radius;
  const top = rect.top - radius;
  const bottom = rect.bottom + radius;

  const strictlyInside =
    startX > left + EPSILON &&
    startX < right - EPSILON &&
    startY > top + EPSILON &&
    startY < bottom - EPSILON;

  if (strictlyInside) {
    const exits = [
      { distance: startX - left, normalX: -1 as const, normalY: 0 as const, x: left, y: startY },
      { distance: right - startX, normalX: 1 as const, normalY: 0 as const, x: right, y: startY },
      { distance: startY - top, normalX: 0 as const, normalY: -1 as const, x: startX, y: top },
      { distance: bottom - startY, normalX: 0 as const, normalY: 1 as const, x: startX, y: bottom },
    ];
    const exit = exits.reduce((best, candidate) =>
      candidate.distance < best.distance ? candidate : best,
    );
    return {
      time: 0,
      normalX: exit.normalX,
      normalY: exit.normalY,
      correctedX: exit.x,
      correctedY: exit.y,
      startedInside: true,
    };
  }

  let xEntry = Number.NEGATIVE_INFINITY;
  let xExit = Number.POSITIVE_INFINITY;
  if (Math.abs(deltaX) < EPSILON) {
    if (startX < left || startX > right) return null;
  } else {
    const t1 = (left - startX) / deltaX;
    const t2 = (right - startX) / deltaX;
    xEntry = Math.min(t1, t2);
    xExit = Math.max(t1, t2);
  }

  let yEntry = Number.NEGATIVE_INFINITY;
  let yExit = Number.POSITIVE_INFINITY;
  if (Math.abs(deltaY) < EPSILON) {
    if (startY < top || startY > bottom) return null;
  } else {
    const t1 = (top - startY) / deltaY;
    const t2 = (bottom - startY) / deltaY;
    yEntry = Math.min(t1, t2);
    yExit = Math.max(t1, t2);
  }

  const entryTime = Math.max(xEntry, yEntry);
  const exitTime = Math.min(xExit, yExit);
  if (
    entryTime > exitTime + EPSILON ||
    exitTime < -EPSILON ||
    entryTime < -EPSILON ||
    entryTime > 1 + EPSILON
  ) {
    return null;
  }

  let normalX: -1 | 0 | 1 = 0;
  let normalY: -1 | 0 | 1 = 0;
  if (Math.abs(xEntry - yEntry) <= EPSILON) {
    normalX = deltaX > 0 ? -1 : deltaX < 0 ? 1 : 0;
    normalY = deltaY > 0 ? -1 : deltaY < 0 ? 1 : 0;
  } else if (xEntry > yEntry) {
    normalX = deltaX > 0 ? -1 : 1;
  } else {
    normalY = deltaY > 0 ? -1 : 1;
  }

  const time = Math.max(0, Math.min(1, entryTime));
  return {
    time,
    normalX,
    normalY,
    correctedX: startX + deltaX * time,
    correctedY: startY + deltaY * time,
    startedInside: false,
  };
}
