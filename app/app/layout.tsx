import type { ReactNode } from "react";
import { WebSplash } from "@/components/splash/WebSplash";

/** The online app (generators, AI designer, billing): the start-up splash once per session. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}<WebSplash /></>;
}
