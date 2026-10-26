import { Array as Arr, pipe, Number as Num, Order } from "effect";

type Box = Readonly<{ left: number; right: number; top: number; bottom: number }>;

type Anchor = Readonly<{ across: number; down: number; whiskerTop: number; whiskerBottom: number }>;

type LabelSpot = Readonly<{ dx: number; dy: number; ring: "near" | "far" }>;

const NEAR_RADIUS = 16;
const FAR_RADIUS = 32;
const CENTER = 0;
const RINGS = [
  { ring: "near", radius: NEAR_RADIUS },
  { ring: "far", radius: FAR_RADIUS },
] as const;
const SLOTS = 8;
const LABEL_WIDTH = 14;
const LABEL_HEIGHT = 12;
const MARKER = 6;
const WHISKER = 4;
const HALF = 2;

const CANDIDATES: readonly LabelSpot[] = pipe(
  RINGS,
  Arr.flatMap(({ ring, radius }) =>
    Array.from({ length: SLOTS }, (_slot, slot) => {
      const angle = (slot / SLOTS) * Math.PI * HALF;
      return {
        dx: Math.round(Math.cos(angle) * radius),
        dy: Math.round(-Math.sin(angle) * radius),
        ring,
      };
    }),
  ),
);

const FALLBACK: LabelSpot = { dx: FAR_RADIUS, dy: CENTER, ring: "far" };

const obstaclesOf = ({ across, down, whiskerTop, whiskerBottom }: Anchor): readonly Box[] => [
  { left: across - MARKER, right: across + MARKER, top: down - MARKER, bottom: down + MARKER },
  { left: across - WHISKER, right: across + WHISKER, top: whiskerTop, bottom: whiskerBottom },
];

const labelBox = (anchor: Anchor, { dx, dy }: LabelSpot): Box => ({
  left: anchor.across + dx - LABEL_WIDTH / HALF,
  right: anchor.across + dx + LABEL_WIDTH / HALF,
  top: anchor.down + dy - LABEL_HEIGHT / HALF,
  bottom: anchor.down + dy + LABEL_HEIGHT / HALF,
});

const overlaps = (one: Box, other: Box): boolean =>
  one.left < other.right &&
  other.left < one.right &&
  one.top < other.bottom &&
  other.top < one.bottom;

const placeLabels = (anchors: readonly Anchor[]): readonly LabelSpot[] => {
  const marks = pipe(
    anchors,
    Arr.flatMap((anchor) => obstaclesOf(anchor)),
  );
  const placed: Box[] = [];
  return pipe(
    anchors,
    Arr.map((anchor) => {
      const obstacles = [...placed, ...marks];
      const clashes = (spot: LabelSpot): number =>
        pipe(
          obstacles,
          Arr.filter((obstacle) => overlaps(labelBox(anchor, spot), obstacle)),
        ).length;
      const [best = FALLBACK] = pipe(CANDIDATES, Arr.sortBy(Order.mapInput(Num.Order, clashes)));
      placed.push(labelBox(anchor, best));
      return best;
    }),
  );
};

export { placeLabels };
export type { LabelSpot };
