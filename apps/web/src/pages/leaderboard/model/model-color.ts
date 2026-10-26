import { Array as Arr, pipe } from "effect";

import { summary } from "./summary";

const PALETTE = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
  "var(--color-series-8)",
] as const;
const GOLDEN_ANGLE = 137.508;
const FULL_TURN = 360;
const HUE_DIGITS = 1;
const FALLBACK = "var(--color-muted-foreground)";
const TONES = ["var(--series-tone-a)", "var(--series-tone-b)"] as const;

const generated = (order: number): string => {
  const hue = ((order * GOLDEN_ANGLE) % FULL_TURN).toFixed(HUE_DIGITS);
  const tone = TONES[order % TONES.length] ?? FALLBACK;
  return `oklch(${tone} var(--series-chroma) ${hue})`;
};

const colors: ReadonlyMap<string, string> = new Map(
  pipe(
    summary.models,
    Arr.map(({ model }, order) => [model, PALETTE[order] ?? generated(order)]),
  ),
);

const colorOf = (model: string): string => colors.get(model) ?? FALLBACK;

export { colorOf };
