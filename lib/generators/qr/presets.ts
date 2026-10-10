import type { GenPreset } from "../types";
import type { QrParams } from "./params";

export const QR_PRESETS: GenPreset<QrParams>[] = [
  {
    id: "keychain", name: "Keychain", note: "30 mm engraved tag with a keyring tab",
    params: {
      name: "QR keychain",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "rounded", size: 30, quiet: 2 },
      plate: { shape: "rect", padding: 3, corner: 4 },
      keyring: { kind: "top", diameter: 5 },
    },
  },
  {
    id: "table-sign", name: "Table sign", note: "90 mm menu code with a frame and “Scan for the menu”",
    params: {
      name: "Menu table sign",
      content: { kind: "url", url: "https://example.com/menu" },
      code: { ecc: "Q", style: "dots", size: 90, quiet: 2, dot: 85 },
      plate: { shape: "rect", padding: 10, corner: 8, frame: true, frameWidth: 1.5 },
      label: { text: "Scan for the menu", position: "below", fontId: "fredoka", size: 9 },
    },
  },
  {
    id: "coaster", name: "Coaster", note: "100 mm round coaster, cut out over a dark backplate",
    params: {
      name: "QR coaster",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "rounded", size: 54, quiet: 2 },
      output: { kind: "cutout" },
      plate: { shape: "circle", padding: 4 },
    },
  },
  {
    id: "wifi-card", name: "Wi-Fi card", note: "Guests scan to join; Wi-Fi logo and network name",
    params: {
      name: "Wi-Fi card",
      content: { kind: "wifi", ssid: "Guest", password: "welcome-2026", security: "WPA" },
      code: { ecc: "H", style: "square", size: 60, quiet: 2 },
      plate: { shape: "rect", padding: 8, corner: 6, frame: true, frameWidth: 1.2 },
      label: { text: "Scan to join Wi-Fi\nNetwork: Guest", position: "below", fontId: "fredoka", size: 5 },
      logo: { kind: "wifi", size: 20 },
    },
  },
  {
    id: "business-card", name: "Business card", note: "Contact card: scan to save the details",
    params: {
      name: "Business card",
      content: { kind: "vcard", first: "Sam", last: "Rivera", org: "Rivera Studio", jobTitle: "Maker", phone: "+1 555 0100", email: "sam@example.com", website: "https://example.com" },
      code: { ecc: "M", style: "square", size: 38, quiet: 2 },
      plate: { shape: "rect", padding: 5, corner: 3 },
      label: { text: "Sam Rivera\nRivera Studio\n+1 555 0100", position: "right", fontId: "fredoka", size: 4 },
    },
  },
  {
    id: "stencil", name: "Paint stencil", note: "120 mm stencil with bridges, to spray a code on a wall or crate",
    params: {
      name: "QR stencil",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "square", size: 120, quiet: 2 },
      output: { kind: "stencil", bridge: 20 },
      plate: { shape: "rect", padding: 15, corner: 6 },
    },
  },
];
