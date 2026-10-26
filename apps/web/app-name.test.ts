import { Stack } from "alchemy";
import { D1, Rules, Zone } from "alchemy/Cloudflare";
import { App, Secret } from "alchemy/Fly";
import { Stage } from "alchemy/Stage";
import { inMemoryState } from "alchemy/State";
import { Effect, Exit, Layer, Match, Redacted, String as Str, pipe } from "effect";
import { expect, test } from "vite-plus/test";

import { APP_NAME, requireAppPrefix } from "./app-name.ts";

const ENV_PREFIX = `${pipe(APP_NAME, Str.replaceAll("-", "_"))}_`;

type Resource =
  | Readonly<{ type: "database"; props: Readonly<{ name?: string }> }>
  | Readonly<{ type: "list"; name: string }>
  | Readonly<{ type: "secret"; name: string }>
  | Readonly<{ type: "zone"; name: string }>;

const flySecret = Effect.fn("flySecret")(function* flySecret(name: string) {
  const app = yield* App("App", { name: `${APP_NAME}-app` });
  return yield* Secret("Secret", { app, name, value: Redacted.make("value") });
});

const deploys = (stackName: string, resource: Resource): Promise<boolean> =>
  Effect.runPromise(
    Stack(
      stackName,
      { providers: Layer.empty, state: inMemoryState() },
      Effect.gen(function* stack() {
        yield* Match.value(resource).pipe(
          Match.discriminatorsExhaustive("type")({
            database: ({ props }) => D1.Database("DB", props),
            list: ({ name }) => Rules.List("List", { name, kind: "ip", items: [] }),
            secret: ({ name }) => flySecret(name),
            zone: ({ name }) => Zone.Zone("Zone", { name }),
          }),
        );
        yield* requireAppPrefix;
      }),
    ).pipe(
      Effect.provideService(Stage, "test"),
      Effect.scoped,
      Effect.exit,
      Effect.map(Exit.isSuccess),
    ),
  );

test.each<Readonly<{ stackName: string; resource: Resource; expected: boolean }>>([
  { stackName: APP_NAME, resource: { type: "database", props: {} }, expected: true },
  {
    stackName: APP_NAME,
    resource: { type: "database", props: { name: `${APP_NAME}-db` } },
    expected: true,
  },
  {
    stackName: APP_NAME,
    resource: { type: "database", props: { name: "web-db" } },
    expected: false,
  },
  {
    stackName: APP_NAME,
    resource: { type: "database", props: { name: `${ENV_PREFIX}db` } },
    expected: false,
  },
  { stackName: APP_NAME, resource: { type: "list", name: `${ENV_PREFIX}hosts` }, expected: true },
  { stackName: APP_NAME, resource: { type: "list", name: "web_hosts" }, expected: false },
  { stackName: APP_NAME, resource: { type: "secret", name: `${ENV_PREFIX}TOKEN` }, expected: true },
  { stackName: APP_NAME, resource: { type: "secret", name: "TOKEN" }, expected: false },
  { stackName: APP_NAME, resource: { type: "secret", name: `${APP_NAME}-TOKEN` }, expected: false },
  { stackName: APP_NAME, resource: { type: "zone", name: "example.com" }, expected: true },
  { stackName: "web", resource: { type: "database", props: {} }, expected: false },
])("stack $stackName with $resource deploys: $expected", ({ stackName, resource, expected }) =>
  expect(deploys(stackName, resource)).resolves.toBe(expected),
);
