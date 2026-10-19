import { RegistryProvider } from "@effect/atom-react";
import { SiteStage } from "@masseater.dev/ui";
import type { ReactNode } from "react";

const StageBody = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <RegistryProvider>
    <SiteStage>{children}</SiteStage>
  </RegistryProvider>
);

export { StageBody };
