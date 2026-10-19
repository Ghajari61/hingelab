/**
 * `npm run desktop:ui:dev` in a normal browser (no Tauri): stand-ins for the Rust commands, so the
 * app's screens can be checked and screenshotted. Never part of a build (main.tsx imports it only
 * when import.meta.env.DEV is true and the page is not inside Tauri).
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

const account = { user: { id: "dev", email: "maker@example.com", name: "Dev Maker" }, plan: "pro", tier: "pro", status: "active", periodEnd: null, entitlements: { cleanExport: true, proShapes: true, proGenerators: true }, minimumVersion: "1.0.0" };
const prefs = { exportDir: null, lastDir: null, openAfterExport: false, projectDir: null, recentFiles: [], homeDir: null, recentMax: 12 };

export function installDevMock() {
  mockWindows("main");
  mockIPC((cmd, args) => {
    switch (cmd) {
      case "app_info": return { version: "dev", server: "http://localhost:3000", signedIn: true };
      case "me": return account;
      case "get_prefs": return prefs;
      case "recent_projects": return [{ path: "C:\\Users\\maker\\Documents\\HingeLab\\Tea box.oclc", name: "Tea box.oclc", exists: true }];
      case "take_open_request": return null;
      case "plugin:app|version": return "dev";
      case "plugin:event|listen": return 1;
      case "save_file": console.info("save_file", args); return { path: "C:\\Users\\maker\\Downloads\\design.svg" };
      case "api_request": return { status: 503, contentType: "application/json", body: btoa(JSON.stringify({ error: "Offline in the dev preview." })), base64: true };
      default: console.info("ipc", cmd, args); return null;
    }
  });
}
