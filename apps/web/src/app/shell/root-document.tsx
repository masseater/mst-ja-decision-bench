import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";

import { StageBody } from "./stage-body";

const devtoolsPlugins = [
  { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel /> },
  { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
];

const RootDocument = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <html lang="ja">
    <head>
      <HeadContent />
    </head>
    <body>
      <StageBody>{children}</StageBody>
      <TanStackDevtools plugins={devtoolsPlugins} />
      <Scripts />
    </body>
  </html>
);

export { RootDocument };
