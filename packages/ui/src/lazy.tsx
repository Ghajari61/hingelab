"use client";

import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";

/**
 * A component loaded on first render in the browser and never on the server (the website's
 * server render and the Windows app's Vite build both accept it, unlike `next/dynamic`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientOnly<C extends ComponentType<any>>(load: () => Promise<{ default: C }>, opts: { loading?: () => ReactNode } = {}): C {
  const Lazy = lazy(load);
  function ClientOnly(props: object) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const fallback = opts.loading?.() ?? null;
    if (!mounted) return <>{fallback}</>;
    return (
      <Suspense fallback={fallback}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Lazy {...(props as any)} />
      </Suspense>
    );
  }
  return ClientOnly as unknown as C;
}
