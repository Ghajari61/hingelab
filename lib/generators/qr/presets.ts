import type { GenPreset } from "../types";
import type { QrParams } from "./params";

export const QR_PRESETS: GenPreset<QrParams>[] = [
  {"id": "studio-care-code", "name": "Product care plaque", "note": "70 mm code linking to product care instructions; replace the example URL.", "params": {"name": "Product care plaque", "content": {"kind": "url", "url": "https://example.com/care"}, "code": {"ecc": "Q", "style": "square", "size": 70, "quiet": 4, "dot": 85}, "plate": {"shape": "rect", "padding": 10, "corner": 8, "frame": true, "frameWidth": 1.5}, "label": {"text": "Care guide", "position": "below", "fontId": "fredoka", "size": 8}}},
  {"id": "studio-guest-wifi", "name": "Guesthouse Wi-Fi plaque", "note": "72 mm guest Wi-Fi code without a logo; enter your own network credentials.", "params": {"name": "Guesthouse Wi-Fi plaque", "content": {"kind": "wifi", "ssid": "Guest", "password": "welcome-2026", "security": "WPA"}, "code": {"ecc": "H", "style": "square", "size": 72, "quiet": 4}, "plate": {"shape": "rect", "padding": 10, "corner": 12, "frame": true, "frameWidth": 1.2}, "label": {"text": "Guest Wi-Fi", "position": "below", "fontId": "fredoka", "size": 7}, "logo": {"kind": "none", "size": 20}}},
  {"id": "studio-inventory-tag", "name": "Workshop inventory tag", "note": "38 mm code with an ITEM 001 label and keyring tab; edit the example URL.", "params": {"name": "Workshop inventory tag", "content": {"kind": "url", "url": "https://example.com/item/001"}, "code": {"ecc": "M", "style": "square", "size": 38, "quiet": 4}, "plate": {"shape": "rect", "padding": 5, "corner": 4}, "keyring": {"kind": "top", "diameter": 5}, "label": {"text": "ITEM 001", "position": "below", "size": 4}}},
  {
    id: "keychain", name: "Keychain", note: "30 mm engraved tag with a keyring tab",
    params: {
      name: "QR keychain",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "rounded", size: 30, quiet: 4 },
      plate: { shape: "rect", padding: 3, corner: 4 },
      keyring: { kind: "top", diameter: 5 },
    },
  },
  {
    id: "table-sign", name: "Table sign", note: "90 mm menu code with a frame and “Scan for the menu”",
    params: {
      name: "Menu table sign",
      content: { kind: "url", url: "https://example.com/menu" },
      code: { ecc: "Q", style: "dots", size: 90, quiet: 4, dot: 85 },
      plate: { shape: "rect", padding: 10, corner: 8, frame: true, frameWidth: 1.5 },
      label: { text: "Scan for the menu", position: "below", fontId: "fredoka", size: 9 },
    },
  },
  {
    id: "coaster", name: "Coaster", note: "100 mm round coaster, cut out over a dark backplate",
    params: {
      name: "QR coaster",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "rounded", size: 54, quiet: 4 },
      output: { kind: "cutout" },
      plate: { shape: "circle", padding: 4 },
    },
  },
  {
    id: "wifi-card", name: "Wi-Fi card", note: "Guests scan to join; Wi-Fi logo and network name",
    params: {
      name: "Wi-Fi card",
      content: { kind: "wifi", ssid: "Guest", password: "welcome-2026", security: "WPA" },
      code: { ecc: "H", style: "square", size: 60, quiet: 4 },
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
      code: { ecc: "M", style: "square", size: 38, quiet: 4 },
      plate: { shape: "rect", padding: 5, corner: 3 },
      label: { text: "Sam Rivera\nRivera Studio\n+1 555 0100", position: "right", fontId: "fredoka", size: 4 },
    },
  },
  {
    id: "stencil", name: "Paint stencil", note: "120 mm stencil with bridges, to spray a code on a wall or crate",
    params: {
      name: "QR stencil",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "square", size: 120, quiet: 4 },
      output: { kind: "stencil", bridge: 20 },
      plate: { shape: "rect", padding: 15, corner: 6 },
    },
  },
  {
    id: "scan-me", name: "Scan me sign", note: "Viewfinder corners and a SCAN ME bar",
    params: {
      name: "Scan me",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "Q", style: "rounded", size: 60, quiet: 4 },
      plate: { shape: "rect", padding: 8, corner: 6, frame: true, frameWidth: 1.6, frameStyle: "corners" },
      label: { text: "SCAN ME", position: "below", fontId: "archivo-black", size: 7, style: "bar" },
    },
  },
  {
    id: "menu-stand", name: "Table menu", note: "Scan for the menu, in a bar above the code",
    params: {
      name: "Menu QR",
      content: { kind: "url", url: "https://example.com/menu" },
      code: { ecc: "M", style: "dots", size: 55, quiet: 4, dot: 85 },
      plate: { shape: "rect", padding: 7, corner: 8, frame: true, frameWidth: 1.2 },
      label: { text: "Scan for the menu", position: "above", fontId: "fredoka", size: 6, style: "bar" },
    },
  },
];
