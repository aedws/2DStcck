import { computeLeveragedPrice } from "../supabase/functions/_shared/engine.ts";

const underlying = {
  currentPrice: 11_000,
  prevDayClose: 10_000,
};

function priceFor(leverage) {
  return computeLeveragedPrice(
    {
      currentPrice: 10_000,
      prevDayClose: 10_000,
      leverage,
    },
    underlying,
  );
}

const actual = {
  inverse: priceFor(-1),
  inverse2x: priceFor(-2),
  leverage2x: priceFor(2),
};
const expected = {
  inverse: 9_000,
  inverse2x: 8_000,
  leverage2x: 12_000,
};

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(
    `derivative direction mismatch: ${JSON.stringify({ actual, expected })}`,
  );
}

console.log("[test:derivatives] -1x / -2x / +2x direction passed");
