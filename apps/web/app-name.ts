import { Stack, isResourceOfType } from "alchemy";
import { Rules, Zone } from "alchemy/Cloudflare";
import { Secret } from "alchemy/Fly";
import {
  Array as Arr,
  Effect,
  Match,
  Option,
  Schema,
  pipe,
  Record as Rec,
  String as Str,
} from "effect";

const APP_NAME = "mst-ja-decision-bench";

const PREFIX = `${APP_NAME}-`;

const ENV_PREFIX = `${pipe(APP_NAME, Str.replaceAll("-", "_"))}_`;

const CI_TELEMETRY_AUDIENCE = `${PREFIX}ci-telemetry`;

const isFlySecret = (resource: unknown): boolean => isResourceOfType(resource, Secret.Type);

const isZone = (resource: unknown): boolean => isResourceOfType(resource, Zone.Zone.Type);

const decodeNamed = Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String }));

const prefixOf = (resource: unknown): string =>
  Match.value(resource).pipe(
    Match.when(Rules.isList, () => ENV_PREFIX),
    Match.when(isFlySecret, () => ENV_PREFIX),
    Match.when(isZone, () => ""),
    Match.orElse(() => PREFIX),
  );

const describeUnprefixed = (
  resource: Readonly<{ FQN: string; Props: unknown }>,
): readonly string[] =>
  decodeNamed(resource.Props).pipe(
    Option.filter(({ name }) => !pipe(name, Str.startsWith(prefixOf(resource)))),
    Option.map(({ name }) => `${resource.FQN}: ${name}`),
    Option.toArray,
  );

const requireAppPrefix = Effect.gen(function* requireAppPrefix() {
  const { name, resources } = yield* Stack;
  const offenders = [
    ...Arr.filter([`Stack: ${name}`], () => name !== APP_NAME),
    ...pipe(
      Rec.values(resources),
      Arr.flatMap((resource) => describeUnprefixed(resource)),
    ),
  ];
  if (Arr.isReadonlyArrayNonEmpty(offenders)) {
    const names = pipe(offenders, Arr.join(", "));
    return yield* Effect.die(
      new Error(
        `Alchemy のスタック名は "${APP_NAME}"、リソース名は "${PREFIX}"（Rules.List と Fly.Secret は "${ENV_PREFIX}"）で始める: ${names}`,
      ),
    );
  }
  return offenders;
});

export { APP_NAME, CI_TELEMETRY_AUDIENCE, ENV_PREFIX, requireAppPrefix };
