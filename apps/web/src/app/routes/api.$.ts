import { createFileRoute } from "@tanstack/react-router";
import { String as Str, pipe } from "effect";

import { api } from "#/app/server/api.server";
import { BASE_PATH } from "#/shared/config";

const handle = ({ request }: Readonly<{ request: Request }>): Promise<Response> => {
  const url = new URL(request.url);
  url.pathname = pipe(url.pathname, Str.slice(BASE_PATH.length));
  return api.handle(new Request(url, request));
};

const Route = createFileRoute("/api/$")({
  server: {
    handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle },
  },
});

export { Route };
