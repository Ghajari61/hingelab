"use client";

import { useEffect, useState } from "react";

/** Under the Windows download: whether this device can run it, and the web editor otherwise. */
export function DownloadNote() {
  const [os, setOs] = useState<"windows" | "other" | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setOs(/Windows NT/i.test(ua) ? "windows" : "other");
  }, []);
  if (os === "windows") return <p className="d-fine d-os">This is the installer for your computer.</p>;
  if (os === "other") return <p className="d-fine d-os">This device is not running Windows; the same editors work in your browser: <a href="/app/editor/local">open the web editor</a>.</p>;
  return null;
}
