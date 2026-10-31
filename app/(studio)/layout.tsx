import type { ReactNode } from "react";
import { StudioProviders } from "@/components/studio/StudioProviders";
import { WebSplash } from "@/components/splash/WebSplash";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioProviders>{children}<WebSplash /></StudioProviders>;
}
