import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { Array as Arr, Option, Schema, pipe } from "effect";

import { RootDocument } from "#/app/shell/root-document";
import { SITE_TITLE, webAnalyticsBeacon } from "#/shared/config";

import appCss from "#/app/styles.css?url";

const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: pipe(
      Schema.decodeUnknownOption(Schema.NonEmptyString)(import.meta.env["VITE_CF_BEACON_TOKEN"]),
      Option.map(webAnalyticsBeacon),
      Arr.fromOption,
    ),
  }),
  shellComponent: RootDocument,
});

export { Route };
