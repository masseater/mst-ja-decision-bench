import { adopt } from "alchemy/AdoptPolicy";
import { AnalyticsEngine, Ruleset, Workers, Zone } from "alchemy/Cloudflare";
import type { InferEnv } from "alchemy/Cloudflare";
import { Effect, Array as Arr, pipe, String as Str, Record as Rec } from "effect";

import { APP_NAME } from "./app-name.ts";
import { SCANNER_PROBES } from "./scanner-probes.ts";

const HONEYPOT_PATHS = ["/.env", "/wp-login.php"] as const;

const PATH = "lower(http.request.uri.path)";

const quote = (value: string): string => `"${value}"`;

const SCANNER_CONDITIONS = {
  contains: [
    ...pipe(
      SCANNER_PROBES.contains,
      Arr.map((fragment) => `${PATH} contains ${quote(fragment)}`),
    ),
    `(${PATH} contains "/." and not starts_with(${PATH}, "/.well-known/"))`,
  ],
  startsWith: pipe(
    SCANNER_PROBES.startsWith,
    Arr.map((prefix) => `starts_with(${PATH}, ${quote(prefix)})`),
  ),
  endsWith: pipe(
    SCANNER_PROBES.endsWith,
    Arr.map((suffix) => `ends_with(${PATH}, ${quote(suffix)})`),
  ),
  equals: pipe(
    SCANNER_PROBES.equals,
    Arr.map((path) => `${PATH} eq ${quote(path)}`),
  ),
} as const;

const scannerRules = (domain: string): Ruleset.Rule[] => {
  const honeypot = `(http.host eq ${quote(domain)} and http.request.uri.path in {${pipe(
    HONEYPOT_PATHS,
    Arr.map((path) => quote(path)),
    Arr.join(" "),
  )}})`;
  return pipe(
    Rec.toEntries(SCANNER_CONDITIONS),
    Arr.map(([kind, conditions]) => ({
      description: `Block vulnerability scanner probes (${kind})`,
      expression: `(${pipe(conditions, Arr.join(" or "))}) and not ${honeypot}`,
      action: "block",
    })),
  );
};

const honeypot = Effect.fn("honeypot")(function* honeypot(
  domain: string,
  compatibility: Readonly<{ date: string }>,
) {
  const HONEYPOT = yield* AnalyticsEngine.Dataset("Honeypot", {
    dataset: `${pipe(APP_NAME, Str.replaceAll("-", "_"))}_honeypot`,
  });
  return yield* Workers.Worker("Honeypot", {
    name: `${APP_NAME}-honeypot`,
    main: "./honeypot.worker.ts",
    compatibility,
    logpush: true,
    env: { HONEYPOT },
    routes: pipe(
      HONEYPOT_PATHS,
      Arr.map((path) => ({ pattern: `${domain}${path}`, zoneName: domain })),
    ),
  });
});

const edgeGuard = Effect.fn("edgeGuard")(function* edgeGuard(
  domain: string,
  compatibility: Readonly<{ date: string }>,
) {
  const zone = yield* Zone.Zone("Zone", { name: domain }).pipe(adopt(true));
  yield* Ruleset.Ruleset("ScannerBlock", {
    zone,
    name: `${APP_NAME}-scanner-block`,
    phase: "http_request_firewall_custom",
    rules: scannerRules(domain),
  });
  return yield* honeypot(domain, compatibility);
});

type HoneypotEnv = InferEnv<ReturnType<typeof honeypot>>;

export type { HoneypotEnv };
export { edgeGuard };
