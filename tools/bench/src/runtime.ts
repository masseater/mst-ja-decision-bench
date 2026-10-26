import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Context,
  Crypto,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Path,
  Schema,
  Stream,
  String as Str,
  pipe,
} from "effect";
import type { Scope } from "effect";
import { Hex } from "effect/encoding";
import { KeyValueStore, PersistedCache, Persistable, Persistence } from "effect/persistence";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { BenchStore, makeCache, toJson } from "./store.ts";
import type { Cached } from "./store.ts";

const OPUS_MODEL = "claude-opus-5-5";
const OPUS_EFFORT = "high";
const REASON_START = 0;
const REASON_LENGTH = 500;

const OpusRowSchema = Schema.Struct({ output: Schema.Unknown, costUsd: Schema.Finite });

type OpusRow = typeof OpusRowSchema.Type;

const ClaudeResultSchema = Schema.Struct({
  is_error: Schema.Boolean,
  total_cost_usd: Schema.Finite,
  structured_output: Schema.optionalKey(Schema.Unknown),
  result: Schema.optionalKey(Schema.String),
});

interface Prompt {
  readonly system: string;
  readonly prompt: string;
  readonly jsonSchema: object;
}

interface Ask<Codec extends Schema.Top> extends Prompt {
  readonly schema: Codec;
  readonly sample: number;
}

interface Asked<Value> {
  readonly output: Value;
  readonly costUsd: number;
}

class Opus extends Context.Service<
  Opus,
  {
    readonly ask: <Codec extends Schema.Codec<unknown, unknown>>(
      request: Ask<Codec>,
    ) => Effect.Effect<Asked<Codec["Type"]>>;
  }
>()("bench/runtime/Opus") {}

type OpusServices = FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner;

const keepWhen = (keep: boolean): Duration.Duration => {
  if (keep) {
    return Duration.infinity;
  }
  return Duration.zero;
};

const makeStore = Effect.gen(function* makeStore() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const root = path.resolve(import.meta.dirname, "..");
  const benchPath = (...segments: readonly string[]): string => path.join(root, ...segments);
  const sha256Hex = (text: string): Effect.Effect<string> =>
    crypto.digest("SHA-256", new TextEncoder().encode(text)).pipe(
      Effect.map((digest) => Hex.encode(digest)),
      Effect.orDie,
    );
  const makePersistedCache = Effect.fn("makePersistedCache")(function* makePersistedCache<
    Codec extends Schema.Codec<unknown, unknown>,
  >(storeId: string, success: Codec, keep: (value: Codec["Type"]) => boolean) {
    const store = KeyValueStore.layerFileSystem(benchPath("cache"));
    const persistence = yield* Layer.build(Persistence.layerKvs.pipe(Layer.provide(store)));
    const Call = Persistable.Class<{
      payload: { key: string; compute: Effect.Effect<Codec["Type"]> };
    }>()(storeId, { primaryKey: ({ key }) => key, success });
    const cache = yield* PersistedCache.make<InstanceType<typeof Call>>((call) => call.compute, {
      storeId: `${storeId}-`,
      timeToLive: (exit) => keepWhen(Exit.isSuccess(exit) && keep(exit.value)),
    }).pipe(Effect.provideContext(persistence));
    const cached: Cached<Codec["Type"]> = (key, compute) =>
      toJson(key).pipe(
        Effect.flatMap(sha256Hex),
        Effect.flatMap((hash) => cache.get(new Call({ key: hash, compute }))),
        Effect.orDie,
      );
    return cached;
  });
  return BenchStore.of({
    benchPath,
    exists: (file) => fileSystem.exists(file).pipe(Effect.orDie),
    readText: (file) => fileSystem.readFileString(file).pipe(Effect.orDie),
    writeText: (file, text) =>
      fileSystem
        .makeDirectory(path.dirname(file), { recursive: true })
        .pipe(Effect.andThen(fileSystem.writeFileString(file, text)), Effect.orDie),
    sha256Hex,
    cache: (storeId, success, keep) =>
      makePersistedCache(storeId, success, keep).pipe(
        Effect.provideContext(platform),
        Effect.orDie,
      ),
  });
});

const claudeArgs = (request: Prompt, jsonSchema: string): readonly string[] => [
  "-p",
  "--model",
  OPUS_MODEL,
  "--effort",
  OPUS_EFFORT,
  "--output-format",
  "json",
  "--json-schema",
  jsonSchema,
  "--system-prompt",
  request.system,
  "--tools",
  "",
  "--setting-sources",
  "",
  "--strict-mcp-config",
  request.prompt,
];

const runClaude = Effect.fn("runClaude")(function* runClaude(request: Prompt) {
  const fileSystem = yield* FileSystem.FileSystem;
  const cwd = yield* fileSystem.makeTempDirectoryScoped();
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const args = claudeArgs(request, yield* toJson(request.jsonSchema));
  const handle = yield* spawner.spawn(ChildProcess.make("claude", args, { cwd, stdin: "ignore" }));
  const [stdout, stderr] = yield* Effect.all(
    [
      handle.stdout.pipe(Stream.decodeText, Stream.mkString),
      handle.stderr.pipe(Stream.decodeText, Stream.mkString),
    ],
    { concurrency: "unbounded" },
  );
  return yield* Schema.decodeEffect(Schema.fromJsonString(ClaudeResultSchema))(stdout).pipe(
    Effect.catchCause(() =>
      Effect.die(pipe(`${stdout}${stderr}`, Str.slice(REASON_START, REASON_LENGTH))),
    ),
  );
}, Effect.scoped);

const structuredOutput = (result: typeof ClaudeResultSchema.Type): Effect.Effect<OpusRow> => {
  if (result.is_error || !("structured_output" in result)) {
    return Effect.die(result.result ?? "no structured output");
  }
  return Effect.succeed({ output: result.structured_output, costUsd: result.total_cost_usd });
};

const keepAll = (): boolean => true;

const makeOpus = Effect.gen(function* makeOpus() {
  const services = yield* Effect.context<OpusServices>();
  const cached = yield* makeCache("opus", OpusRowSchema, keepAll);
  const lookup = (request: Prompt & Readonly<{ sample: number }>): Effect.Effect<OpusRow> =>
    cached(
      {
        model: OPUS_MODEL,
        effort: OPUS_EFFORT,
        system: request.system,
        prompt: request.prompt,
        jsonSchema: request.jsonSchema,
        sample: request.sample,
      },
      runClaude(request).pipe(
        Effect.flatMap(structuredOutput),
        Effect.provideContext(services),
        Effect.orDie,
      ),
    );
  return Opus.of({
    ask: (request) =>
      lookup(request).pipe(
        Effect.flatMap((row) =>
          Schema.decodeUnknownEffect(request.schema)(row.output).pipe(
            Effect.map((output) => ({ output, costUsd: row.costUsd })),
          ),
        ),
        Effect.orDie,
      ),
  });
});

const benchLayer = Layer.effect(Opus, makeOpus).pipe(
  Layer.provideMerge(Layer.effect(BenchStore, makeStore)),
  Layer.provideMerge(NodeServices.layer),
);

const runBench = <Failure>(
  program: Effect.Effect<void, Failure, Opus | BenchStore | Scope.Scope>,
): void => {
  NodeRuntime.runMain(
    Layer.build(benchLayer).pipe(
      Effect.flatMap((context) => Effect.provideContext(program, context)),
      Effect.scoped,
    ),
  );
};

export { Opus, runBench };
