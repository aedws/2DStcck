/**
 * 물타기·불타기(추가 매수) 평단 시뮬레이션.
 * 가격·원금은 게임 현금 단위(센트). 실제 주문은 하지 않는다.
 */

export interface AveragingInput {
  quantity: number;
  averagePrice: number;
  addPrice: number;
  addQuantity: number;
}

export interface AveragingResult {
  ok: true;
  mode: "water" | "fire" | "flat";
  newQuantity: number;
  newAveragePrice: number;
  totalCost: number;
  addCost: number;
  averageDelta: number;
  averageDeltaPct: number;
}

export type AveragingFailure = {
  ok: false;
  message: string;
};

export type AveragingOutcome = AveragingResult | AveragingFailure;

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** 추가 매수 후 새 평단·수량·원금을 계산한다. */
export function simulateAveragingBuy(input: AveragingInput): AveragingOutcome {
  const { quantity, averagePrice, addPrice, addQuantity } = input;
  if (!finitePositive(quantity)) {
    return { ok: false, message: "보유 수량을 확인해 주세요." };
  }
  if (!finitePositive(averagePrice)) {
    return { ok: false, message: "현재 평단을 확인해 주세요." };
  }
  if (!finitePositive(addPrice)) {
    return { ok: false, message: "추가 매수 단가를 확인해 주세요." };
  }
  if (!finitePositive(addQuantity)) {
    return { ok: false, message: "추가 매수 수량을 확인해 주세요." };
  }

  const newQuantity = quantity + addQuantity;
  const addCost = addPrice * addQuantity;
  const totalCost = averagePrice * quantity + addCost;
  const newAveragePrice = totalCost / newQuantity;
  const averageDelta = newAveragePrice - averagePrice;
  const averageDeltaPct = (averageDelta / averagePrice) * 100;
  const mode =
    addPrice < averagePrice ? "water" : addPrice > averagePrice ? "fire" : "flat";

  return {
    ok: true,
    mode,
    newQuantity,
    newAveragePrice,
    totalCost,
    addCost,
    averageDelta,
    averageDeltaPct,
  };
}

/**
 * 목표 평단에 도달하기 위해 필요한 추가 매수 수량.
 * 도달 불가능하면 null.
 */
export function quantityToReachTargetAverage(input: {
  quantity: number;
  averagePrice: number;
  addPrice: number;
  targetAveragePrice: number;
}): number | null {
  const { quantity, averagePrice, addPrice, targetAveragePrice } = input;
  if (
    !finitePositive(quantity) ||
    !finitePositive(averagePrice) ||
    !finitePositive(addPrice) ||
    !finitePositive(targetAveragePrice)
  ) {
    return null;
  }
  // addQ = q * (avg - target) / (target - addPrice)
  const numerator = quantity * (averagePrice - targetAveragePrice);
  const denominator = targetAveragePrice - addPrice;
  if (denominator === 0) return null;
  const addQuantity = numerator / denominator;
  if (!Number.isFinite(addQuantity) || addQuantity <= 0) return null;

  // 추가 매수로 평단이 목표로 실제로 이동하는지 검증한다.
  const simulated = simulateAveragingBuy({
    quantity,
    averagePrice,
    addPrice,
    addQuantity,
  });
  if (!simulated.ok) return null;
  if (Math.abs(simulated.newAveragePrice - targetAveragePrice) > 0.01) {
    return null;
  }
  return addQuantity;
}

/** 목표 평단 도달에 필요한 추가 매수 금액(센트). */
export function amountToReachTargetAverage(input: {
  quantity: number;
  averagePrice: number;
  addPrice: number;
  targetAveragePrice: number;
}): number | null {
  const addQuantity = quantityToReachTargetAverage(input);
  if (addQuantity === null) return null;
  return addQuantity * input.addPrice;
}

/** 추가 매수 금액(센트)으로 살 수 있는 수량. */
export function quantityFromAddAmount(
  addPrice: number,
  addAmount: number,
): number | null {
  if (!finitePositive(addPrice) || !finitePositive(addAmount)) return null;
  return addAmount / addPrice;
}
