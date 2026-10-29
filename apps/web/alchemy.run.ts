import { Stack } from "alchemy";
import { Rules, Ruleset, Workers, providers, state } from "alchemy/Cloudflare";
import { Build } from "alchemy/Command";
import type { InferEnv } from "alchemy/Cloudflare";
import { Config, Effect, Option, Schema } from "effect";

import { APP_NAME, CI_TELEMETRY_AUDIENCE, ENV_PREFIX, requireAppPrefix } from "./app-name.ts";
import { BASE_PATH } from "./base-path.ts";
import { edgeGuard } from "./edge-guard.ts";

const ZONE = "masseater.dev";
const LEGACY_HOST = "mst-ja-decision-bench.masseater.dev";
const LEGACY_REDIRECT_LIST = `${ENV_PREFIX}legacy_host`;

const COMPATIBILITY = { date: "2026-08-25" } as const;

const OWNED_ZONE = Option.none<string>();

const site = Effect.gen(function* site() {
  const build = yield* Build("WebBuild", { command: "vp build", outdir: "dist/client", memo: false });
  return yield* Workers.Worker("Web", {
    compatibility: COMPATIBILITY,
    logpush: true,
    domain: LEGACY_HOST,
    routes: [{ pattern: `${ZONE}${BASE_PATH}*`, zoneName: ZONE }],
    assets: {
      directory: build.outdir,
      base: BASE_PATH,
      htmlHandling: "auto-trailing-slash",
    },
  });
});

const legacyHostRedirect = Effect.gen(function* legacyHostRedirect() {
  const list = yield* Rules.List("LegacyHostRedirects", {
    name: LEGACY_REDIRECT_LIST,
    kind: "redirect",
    items: [
      {
        redirect: {
          sourceUrl: `${LEGACY_HOST}/`,
          targetUrl: `https://${ZONE}${BASE_PATH}/`,
          statusCode: 301,
          subpathMatching: true,
          preservePathSuffix: true,
          preserveQueryString: true,
        },
      },
    ],
  });
  return yield* Ruleset.AccountEntrypoint("BulkRedirects", {
    phase: "http_request_redirect",
    rules: [
      {
        action: "redirect",
        expression: `http.request.full_uri in $${LEGACY_REDIRECT_LIST}`,
        actionParameters: { fromList: { name: list.name, key: "http.request.full_uri" } },
      },
    ],
  });
});

const ciTelemetry = Effect.gen(function* ciTelemetry() {
  const GITHUB_REPOSITORY = yield* Config.schema(Schema.String, "GITHUB_REPOSITORY").pipe(
    Config.withDefault(""),
  );
  return yield* Workers.Worker("CiTelemetry", {
    name: CI_TELEMETRY_AUDIENCE,
    main: "./ci-telemetry.worker.ts",
    compatibility: COMPATIBILITY,
    logpush: true,
    env: { GITHUB_REPOSITORY },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false, persist: true },
    },
  });
});

type CiTelemetryEnv = InferEnv<typeof ciTelemetry>;

export type { CiTelemetryEnv };
export default Stack(
  APP_NAME,
  { providers: providers(), state: state() },
  Effect.gen(function* stack() {
    const { url } = yield* site;
    yield* legacyHostRedirect;
    yield* Option.match(OWNED_ZONE, {
      onNone: () => Effect.void,
      onSome: (zone) => edgeGuard(zone, COMPATIBILITY),
    });
    yield* ciTelemetry;
    yield* requireAppPrefix;
    return { url };
  }),
);
