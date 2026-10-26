import type { TaskId } from "bench-summary/schema";
import { Context, Effect, Schema, Array as Arr, pipe, String as Str } from "effect";
import type { Scope } from "effect";

const INDENT = 2;

type Cached<Value> = (key: unknown, compute: Effect.Effect<Value>) => Effect.Effect<Value>;

class BenchStore extends Context.Service<
  BenchStore,
  {
    readonly benchPath: (...segments: readonly string[]) => string;
    readonly exists: (file: string) => Effect.Effect<boolean>;
    readonly readText: (file: string) => Effect.Effect<string>;
    readonly writeText: (file: string, text: string) => Effect.Effect<void>;
    readonly sha256Hex: (text: string) => Effect.Effect<string>;
    readonly cache: <Codec extends Schema.Codec<unknown, unknown>>(
      storeId: string,
      success: Codec,
      keep: (value: Codec["Type"]) => boolean,
    ) => Effect.Effect<Cached<Codec["Type"]>, never, Scope.Scope>;
  }
>()("bench/store/BenchStore") {}

const benchPath = Effect.fn("benchPath")(function* benchPath(...segments: readonly string[]) {
  const store = yield* BenchStore;
  return store.benchPath(...segments);
});

const dataPath = ({
  task,
  extension,
}: Readonly<{ task: TaskId; extension: "jsonl" | "stats.json" }>): ReturnType<typeof benchPath> =>
  benchPath("data", `${task}.${extension}`);

const modelSlug = (model: string): string => pipe(model, Str.replaceAll("/", "__"));

const readText = Effect.fn("readText")(function* readText(file: string) {
  const store = yield* BenchStore;
  return yield* store.readText(file);
});

const writeText = Effect.fn("writeText")(function* writeText(file: string, text: string) {
  const store = yield* BenchStore;
  yield* store.writeText(file, text);
});

const readJsonl = Effect.fn("readJsonl")(function* readJsonl<Codec extends Schema.Top>(
  schema: Codec,
  file: string,
) {
  const store = yield* BenchStore;
  if (!(yield* store.exists(file))) {
    return [];
  }
  const text = yield* store.readText(file);
  const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(schema));
  return yield* Effect.forEach(
    pipe(
      text,
      Str.split("\n"),
      Arr.filter((line) => Str.trim(line) !== ""),
    ),
    (line) => decode(line),
  );
});

const writeJsonl = Effect.fn("writeJsonl")(function* writeJsonl<Codec extends Schema.Top>(
  schema: Codec,
  file: string,
  rows: readonly Codec["Type"][],
) {
  const encode = Schema.encodeEffect(Schema.fromJsonString(schema));
  const lines = yield* Effect.forEach(rows, (row) => encode(row), { concurrency: "unbounded" });
  yield* writeText(
    file,
    pipe(
      lines,
      Arr.map((line) => `${line}\n`),
      Arr.join(""),
    ),
  );
});

const writeJson = Effect.fn("writeJson")(function* writeJson<Codec extends Schema.Top>(
  schema: Codec,
  file: string,
  value: Codec["Type"],
) {
  const text = yield* Schema.encodeEffect(Schema.fromJsonString(schema, { space: INDENT }))(value);
  yield* writeText(file, `${text}\n`);
});

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const toJson = (value: unknown): Effect.Effect<string, Schema.SchemaError> => encodeJson(value);

const sha256 = Effect.fn("sha256")(function* sha256(value: unknown) {
  const store = yield* BenchStore;
  return yield* store.sha256Hex(yield* toJson(value));
});

const makeCache = Effect.fn("makeCache")(function* makeCache<
  Codec extends Schema.Codec<unknown, unknown>,
>(storeId: string, success: Codec, keep: (value: Codec["Type"]) => boolean) {
  const store = yield* BenchStore;
  return yield* store.cache(storeId, success, keep);
});

export {
  BenchStore,
  benchPath,
  dataPath,
  makeCache,
  modelSlug,
  readJsonl,
  readText,
  sha256,
  toJson,
  writeJson,
  writeJsonl,
  writeText,
};
export type { Cached };
