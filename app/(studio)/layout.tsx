import type { ReactNode } from "react";
import { StudioProviders } from "@/components/studio/StudioProviders";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioProviders>{children}</StudioProviders>;
}
