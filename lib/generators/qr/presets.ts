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
{
    id: "review-stand", name: "Review sign", note: "Five stars and “Leave us a review” on an arch in a slotted base, for the counter",
    params: {
      name: "Review sign",
      content: { kind: "url", url: "https://example.com/review" },
      code: { ecc: "Q", style: "rounded", size: 55, quiet: 4, eyeFrame: "rounded", eyeBall: "rounded" },
      plate: { shape: "arch", padding: 8 },
      badge: { kind: "stars", size: 9 },
      label: { text: "Loved your visit?\nLeave us a review", position: "below", fontId: "fredoka", size: 5.5 },
      stand: { kind: "base", depth: 60, layers: 2 },
    },
  },
  {
    id: "menu-tent", name: "Menu tent card", note: "Folds on a living hinge; the menu code reads from both sides of the table",
    params: {
      name: "Menu tent card",
      content: { kind: "url", url: "https://example.com/menu" },
      code: { ecc: "M", style: "dots", size: 55, quiet: 4, dot: 85 },
      plate: { padding: 7, corner: 5, frame: true, frameWidth: 1, frameStyle: "corners" },
      badge: { kind: "menu", size: 12 },
      label: { text: "Scan for the menu", position: "below", fontId: "fredoka", size: 6 },
      stand: { kind: "tent", band: 18 },
    },
  },
  {
    id: "pay-counter", name: "Scan or tap to pay", note: "Counter sign on two feet, with the contactless sign for an NFC tag behind it",
    params: {
      name: "Pay here sign",
      content: { kind: "url", url: "https://example.com/pay" },
      code: { ecc: "Q", style: "square", size: 55, quiet: 4 },
      plate: { shape: "rect", padding: 8, corner: 8, frame: true, frameWidth: 1.2 },
      badge: { kind: "tap", size: 12 },
      label: { text: "Scan or tap to pay", position: "below", fontId: "archivo-black", size: 6, style: "bar" },
      stand: { kind: "feet", depth: 60, lean: 12 },
    },
  },
  {
    id: "wifi-stand", name: "Wi-Fi stand", note: "Guests scan to join; stands in a base on the reception desk",
    params: {
      name: "Wi-Fi stand",
      content: { kind: "wifi", ssid: "Guest", password: "welcome-2026", security: "WPA" },
      code: { ecc: "Q", style: "rounded", size: 55, quiet: 4, eyeFrame: "circle", eyeBall: "circle" },
      plate: { shape: "rect", padding: 8, corner: 10 },
      badge: { kind: "wifi", size: 12 },
      label: { text: "Free Wi-Fi\nScan to connect", position: "below", fontId: "fredoka", size: 6 },
      stand: { kind: "base", depth: 55, layers: 2 },
    },
  },
  {
    id: "social-follow", name: "Follow us sign", note: "Camera picture and your handle on a hexagon that leans back on two feet",
    params: {
      name: "Follow us",
      content: { kind: "url", url: "https://example.com/@yourshop" },
      code: { ecc: "M", style: "connected", size: 50, quiet: 4, dot: 80, eyeFrame: "circle", eyeBall: "circle" },
      plate: { shape: "hexagon", padding: 5, corner: 3 },
      badge: { kind: "camera", size: 11 },
      label: { text: "Follow us\n@yourshop", position: "below", fontId: "fredoka", size: 5.5 },
      stand: { kind: "feet", depth: 60, lean: 10 },
    },
  },
  {
    id: "photo-share", name: "Wedding photo share", note: "“Share your photos” arch in a base, leaf-shaped eyes",
    params: {
      name: "Share your photos",
      content: { kind: "url", url: "https://example.com/album" },
      code: { ecc: "Q", style: "dots", size: 55, quiet: 4, dot: 85, eyeFrame: "leaf", eyeBall: "leaf" },
      plate: { shape: "arch", padding: 8 },
      badge: { kind: "heart", size: 9 },
      label: { text: "Share your photos\nwith us", position: "below", fontId: "pacifico", size: 6 },
      stand: { kind: "base", depth: 60, layers: 2 },
    },
  },
  {
    id: "pet-tag", name: "Pet ID tag", note: "Dog-bone tag: anyone who finds your pet scans to call you",
    params: {
      name: "Pet tag",
      content: { kind: "phone", tel: "+1 555 0100" },
      code: { ecc: "M", style: "square", size: 24, quiet: 4 },
      plate: { shape: "bone", padding: 2, corner: 3 },
      keyring: { kind: "corner", diameter: 4 },
    },
  },
  {
    id: "plant-marker", name: "Plant marker", note: "On a pointed stake: scan for the plant's care page",
    params: {
      name: "Plant marker",
      content: { kind: "url", url: "https://example.com/plants/basil" },
      code: { ecc: "M", style: "rounded", size: 36, quiet: 4 },
      plate: { shape: "stake", padding: 4, corner: 4, stake: 100 },
      badge: { kind: "leaf", size: 7 },
      label: { text: "Basil", position: "below", fontId: "fredoka", size: 6 },
    },
  },
  {
    id: "whatsapp-sign", name: "WhatsApp chat sign", note: "Opens a chat with your number; hangs on two screws",
    params: {
      name: "Chat with us",
      content: { kind: "whatsapp", waTo: "+44 7700 900123", waText: "Hello!" },
      code: { ecc: "M", style: "rounded", size: 55, quiet: 4 },
      plate: { shape: "rect", padding: 9, corner: 8 },
      badge: { kind: "chat", size: 11 },
      label: { text: "Message us", position: "below", fontId: "fredoka", size: 6 },
      stand: { kind: "wall", holes: "two", holeD: 4 },
    },
  },
  {
    id: "location-sign", name: "Find us sign", note: "Map pin and a code that opens your address in a map; four holes for standoffs",
    params: {
      name: "Find us",
      content: { kind: "map", place: "10 Example Street, London" },
      code: { ecc: "M", style: "square", size: 60, quiet: 4 },
      plate: { shape: "rect", padding: 12, corner: 4 },
      badge: { kind: "pin", size: 12 },
      label: { text: "Find us", position: "below", fontId: "archivo-black", size: 7 },
      stand: { kind: "wall", holes: "four", holeD: 5 },
    },
  },
  {
    id: "event-card", name: "Save the date", note: "Scanning adds the event to the phone's calendar",
    params: {
      name: "Save the date",
      content: { kind: "event", evTitle: "Our wedding", evDate: "2027-06-12", evStart: "15:00", evEnd: "23:00", evPlace: "The Old Barn" },
      code: { ecc: "M", style: "dots", size: 50, quiet: 4, dot: 85 },
      plate: { shape: "rect", padding: 8, corner: 6, frame: true, frameWidth: 1 },
      badge: { kind: "calendar", size: 10 },
      label: { text: "Save the date", position: "below", fontId: "pacifico", size: 6 },
    },
  },
  {
    id: "scan-bubble", name: "Scan me bubble", note: "A speech bubble with a SCAN ME bar",
    params: {
      name: "Scan me bubble",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "rounded", size: 50, quiet: 4 },
      plate: { shape: "bubble", padding: 6 },
      label: { text: "SCAN ME", position: "below", fontId: "archivo-black", size: 7, style: "bar" },
    },
  },
  {
    id: "designer-code", name: "Designer code", note: "Diamond modules with leaf eyes on a round coaster",
    params: {
      name: "Designer QR",
      content: { kind: "url", url: "https://example.com" },
      code: { ecc: "M", style: "diamond", size: 54, quiet: 4, dot: 90, eyeFrame: "leaf", eyeBall: "leaf" },
      plate: { shape: "circle", padding: 4 },
    },
  },
];
