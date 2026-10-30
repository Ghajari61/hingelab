/** What the code holds (the standard formats phones understand) and its module matrix. */
import qrcode from "qrcode-generator";
import type { ContentKind, Ecc, QrParams } from "./params";

export const CONTENT_NAMES: Record<ContentKind, string> = {
  url: "Web address", text: "Text", wifi: "Wi-Fi", vcard: "Contact", email: "Email", sms: "Text message", phone: "Phone call",
  whatsapp: "WhatsApp", map: "Map location", event: "Event",
};

/** iCalendar text values escape backslash, comma, semicolon and new lines. */
const iEsc = (s: string) => s.replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
/** "2026-12-31" and "19:30" as an iCalendar local time, or "" when the date is not a date. */
export function icalTime(date: string, time: string): string {
  const d = date.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!d) return "";
  const pad = (v: string | number) => String(v).padStart(2, "0");
  const day = `${d[1]}${pad(d[2])}${pad(d[3])}`;
  const t = time.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  return t ? `${day}T${pad(t[1])}${pad(t[2])}00` : day;
}

/** Backslash before the characters the Wi-Fi format reserves. */
const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
/** vCard text values escape backslash, comma, semicolon and new lines. */
const vEsc = (s: string) => s.replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const digits = (s: string) => s.replace(/[^\d+*#]/g, "");

/** The text encoded in the code, or "" when the content is still empty. */
export function qrPayload(c: QrParams["content"]): string {
  switch (c.kind) {
    case "url": {
      const u = c.url.trim();
      if (!u) return "";
      return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
    }
    case "text": return c.text.trim() ? c.text : "";
    case "wifi": {
      if (!c.ssid.trim()) return "";
      const pw = c.security === "nopass" ? "" : `P:${wifiEsc(c.password)};`;
      return `WIFI:T:${c.security};S:${wifiEsc(c.ssid)};${pw}${c.hidden ? "H:true;" : ""};`;
    }
    case "vcard": {
      const fn = [c.first, c.last].map((s) => s.trim()).filter(Boolean).join(" ");
      if (!fn && !c.org.trim() && !c.phone.trim() && !c.email.trim()) return "";
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(c.last.trim())};${vEsc(c.first.trim())};;;`, `FN:${vEsc(fn || c.org.trim())}`];
      if (c.org.trim()) lines.push(`ORG:${vEsc(c.org.trim())}`);
      if (c.jobTitle.trim()) lines.push(`TITLE:${vEsc(c.jobTitle.trim())}`);
      if (c.phone.trim()) lines.push(`TEL;TYPE=CELL:${c.phone.trim()}`);
      if (c.email.trim()) lines.push(`EMAIL:${c.email.trim()}`);
      if (c.website.trim()) lines.push(`URL:${c.website.trim()}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "email": {
      const to = c.to.trim();
      if (!to) return "";
      const q = [c.subject.trim() && `subject=${encodeURIComponent(c.subject.trim())}`, c.body.trim() && `body=${encodeURIComponent(c.body)}`].filter(Boolean);
      return `mailto:${to}${q.length ? `?${q.join("&")}` : ""}`;
    }
    case "sms": {
      const n = digits(c.smsTo);
      return n ? `SMSTO:${n}:${c.message}` : "";
    }
    case "phone": {
      const n = digits(c.tel);
      return n ? `tel:${n}` : "";
    }
    case "whatsapp": {
      // wa.me takes the full international number without + or leading zeros
      const n = c.waTo.replace(/\D/g, "").replace(/^00/, "");
      if (!n) return "";
      return `https://wa.me/${n}${c.waText.trim() ? `?text=${encodeURIComponent(c.waText.trim())}` : ""}`;
    }
    case "map": {
      const q = c.place.trim();
      if (!q) return "";
      const ll = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
      return `https://www.google.com/maps/search/?api=1&query=${ll ? `${ll[1]},${ll[2]}` : encodeURIComponent(q)}`;
    }
    case "event": {
      const start = icalTime(c.evDate, c.evStart);
      if (!c.evTitle.trim() || !start) return "";
      const end = icalTime(c.evDate, c.evEnd);
      const allDay = start.length === 8;
      const lines = ["BEGIN:VEVENT", `SUMMARY:${iEsc(c.evTitle.trim())}`, allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`];
      if (!allDay && end > start) lines.push(`DTEND:${end}`);
      if (c.evPlace.trim()) lines.push(`LOCATION:${iEsc(c.evPlace.trim())}`);
      lines.push("END:VEVENT");
      return lines.join("\n");
    }
  }
}

export interface QrMatrix {
  version: number;
  /** Modules across. */
  n: number;
  dark: boolean[][];
}

/** UTF-8 bytes as a one-byte-per-character string, which the encoder's byte mode takes as is. */
function utf8Binary(s: string): string {
  let out = "";
  for (const b of new TextEncoder().encode(s)) out += String.fromCharCode(b);
  return out;
}

/** The smallest code that holds the text at this level, or null when it is too long for any. */
export function qrMatrix(payload: string, ecc: Ecc): QrMatrix | null {
  try {
    const q = qrcode(0, ecc);
    q.addData(utf8Binary(payload), "Byte");
    q.make();
    const n = q.getModuleCount();
    const dark = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
    return { version: (n - 17) / 4, n, dark };
  } catch {
    return null;
  }
}
