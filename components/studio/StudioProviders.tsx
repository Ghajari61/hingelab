"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui";
import { ThemeSync } from "./usePrefs";
import "./studio.css";

export function StudioProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ThemeSync />
      {children}
    </ToastProvider>
  );
}
