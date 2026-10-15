"use client";

import { useEffect, useState } from "react";
import { buildFlags, clientFlags, FLAGS_KEY, type FlagId } from "@/lib/flags";

/** Feature flags in this browser (the build's until mounted, then the device's additions too). */
export function useFlags(): ReadonlySet<FlagId> {
  const [flags, setFlags] = useState<ReadonlySet<FlagId>>(() => buildFlags());
  useEffect(() => {
    setFlags(clientFlags());
    const again = (e: StorageEvent) => { if (e.key === FLAGS_KEY) setFlags(clientFlags()); };
    window.addEventListener("storage", again);
    return () => window.removeEventListener("storage", again);
  }, []);
  return flags;
}
