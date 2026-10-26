import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Array as Arr, pipe } from "effect";
import { Atom } from "effect/reactivity";

type Focus = Readonly<{ status: "none" }> | Readonly<{ status: "focused"; model: string }>;

type LegendItem = Readonly<{ value: string | undefined }>;

type SeriesKey = Readonly<{ model: string; name: string }>;

type SeriesState = Readonly<{
  hidden: boolean;
  focus: "plain" | "focused" | "faded";
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}>;

type LegendHandlers = Readonly<{
  handleClick: (item: LegendItem) => void;
  handleMouseEnter: (item: LegendItem) => void;
  handleMouseLeave: () => void;
}>;

const NO_FOCUS: Focus = { status: "none" };
const NONE_HIDDEN: readonly string[] = [];

const hiddenAtom = Atom.family((_task: string) => Atom.make<readonly string[]>(NONE_HIDDEN));
const focusAtom = Atom.family((_task: string) => Atom.make<Focus>(NO_FOCUS));

const toggled = ({
  hidden,
  model,
}: Readonly<{ hidden: readonly string[]; model: string }>): readonly string[] => {
  if (hidden.includes(model)) {
    return pipe(
      hidden,
      Arr.filter((item) => item !== model),
    );
  }
  return [...hidden, model];
};

const focusOf = ({
  focus,
  model,
}: Readonly<{ focus: Focus; model: string }>): SeriesState["focus"] => {
  if (focus.status === "none") {
    return "plain";
  }
  if (focus.model === model) {
    return "focused";
  }
  return "faded";
};

const modelNamed = ({
  series,
  name,
}: Readonly<{ series: readonly SeriesKey[]; name: string | undefined }>): Focus => {
  const [found] = pipe(
    series,
    Arr.filter((item) => item.name === name),
    Arr.map(({ model }): Focus => ({ status: "focused", model })),
  );
  return found ?? NO_FOCUS;
};

const useSeriesState = ({ task }: Readonly<{ task: string }>): ((model: string) => SeriesState) => {
  const hidden = useAtomValue(hiddenAtom(task));
  const focus = useAtomValue(focusAtom(task));
  const setFocus = useAtomSet(focusAtom(task));
  return (model) => ({
    hidden: hidden.includes(model),
    focus: focusOf({ focus, model }),
    handleMouseEnter: () => {
      setFocus({ status: "focused", model });
    },
    handleMouseLeave: () => {
      setFocus(NO_FOCUS);
    },
  });
};

const useLegendHandlers = ({
  task,
  series,
}: Readonly<{ task: string; series: readonly SeriesKey[] }>): LegendHandlers => {
  const setHidden = useAtomSet(hiddenAtom(task));
  const setFocus = useAtomSet(focusAtom(task));
  return {
    handleClick: ({ value }) => {
      const target = modelNamed({ series, name: value });
      if (target.status === "focused") {
        setHidden((hidden) => toggled({ hidden, model: target.model }));
      }
    },
    handleMouseEnter: ({ value }) => {
      setFocus(modelNamed({ series, name: value }));
    },
    handleMouseLeave: () => {
      setFocus(NO_FOCUS);
    },
  };
};

export { useLegendHandlers, useSeriesState };
export type { SeriesState };
