/**
 * Response headers. `securityHeaders` goes on every page (next.config.ts); `downloadHeaders` on the
 * files the API sends, which must never run as a page of our origin even if someone navigates to
 * one: they are attachments, their type is not sniffed and a sandbox CSP blocks script.
 */

const DOWNLOAD_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

export function downloadHeaders(type: string, fileName?: string): Record<string, string> {
  const name = fileName ? `; filename="${fileName.replace(/[^\w.-]/g, "_").slice(0, 150)}"` : "";
  return {
    "content-type": type,
    "content-disposition": `attachment${name}`,
    "content-security-policy": DOWNLOAD_CSP,
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  };
}

export interface CSPOptions {
  dev: boolean;
  /** Served over HTTPS only (Vercel): plain-http requests are upgraded and HSTS is sent. */
  https?: boolean;
  /** Vercel preview deployments load the Vercel toolbar. */
  preview: boolean;
  supabaseURL: string;
  /** NEXT_PUBLIC_DEPTH_MODEL_URL, when the depth model is hosted elsewhere. */
  depthModelURL?: string;
}

const originOf = (url: string | undefined) => {
  try { return url ? new URL(url).origin : ""; } catch { return ""; }
};

/** The site's Content Security Policy. */
export function contentSecurityPolicy({ dev, https, preview, supabaseURL, depthModelURL }: CSPOptions): string {
  let supabase = "";
  try {
    if (supabaseURL) {
      const u = new URL(supabaseURL);
      supabase = `${u.origin} ${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    }
  } catch { /* not a URL */ }
  const toolbar = preview ? " https://vercel.live" : "";
  const d = {
    "default-src": "'self'",
    // Next.js and the theme boot script are inline; WebAssembly (manifold, HarfBuzz, ONNX) needs wasm-unsafe-eval.
    "script-src": `'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}${toolbar}`,
    "style-src": "'self' 'unsafe-inline'",
    "font-src": "'self' data:",
    "img-src": `'self' data: blob: https://*.googleusercontent.com${toolbar} ${preview ? "https://vercel.com" : ""}`.trim(),
    "connect-src": `'self' ${supabase} ${originOf(depthModelURL)} https://huggingface.co https://*.huggingface.co https://*.hf.co${dev ? " ws: http://127.0.0.1:* http://localhost:*" : ""}${toolbar}`.replace(/\s+/g, " "),
    "worker-src": "'self' blob:",
    "frame-src": `'self'${toolbar}`,
    "frame-ancestors": "'self'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "manifest-src": "'self'",
  };
  return Object.entries(d).map(([k, v]) => `${k} ${v}`).join("; ") + (https && !dev ? "; upgrade-insecure-requests" : "");
}

/** Headers for every response. The CSP is separate: API routes set their own (downloads are sandboxed). */
export function securityHeaders(o: CSPOptions): { key: string; value: string }[] {
  const h = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
  if (o.https && !o.dev) h.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return h;
}
