import { Array as Arr, Record as Rec, pipe } from "effect";

import { BASE_PATH } from "./base-path.ts";

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ASSET_HEADERS = pipe(
  [
    "/*",
    ...pipe(
      Rec.toEntries(SECURITY_HEADERS),
      Arr.map(([name, value]) => `  ${name}: ${value}`),
    ),
    `${BASE_PATH}/assets/*`,
    `  Cache-Control: ${ASSET_CACHE_CONTROL}`,
    "",
  ],
  Arr.join("\n"),
);

export { ASSET_HEADERS };
