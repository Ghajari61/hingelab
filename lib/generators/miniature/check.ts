import type { Issue } from "@/lib/issues";
import type { MiniOutput } from "./house";
import { scaleOf, type MiniatureParams } from "./params";

type I = Issue<MiniatureParams>;

export function checkMiniature(p: MiniatureParams, out: MiniOutput): I[] {
  const issues: I[] = [];
  const info = out.info as (MiniOutput["info"] & { thin?: number; sceneH?: number }) | undefined;
  if (out.error || !info) return issues;
  const T = p.T;
  if (p.design === "house") {
    const h = p.house;
    if (info.roomW < 30) {
      const rooms = Math.max(1, Math.floor((h.width - 2 * T + T) / (30 + T)));
      issues.push({ code: "ROOM_NARROW", level: "warn", message: `Rooms are only ${info.roomW.toFixed(0)} mm wide; little fits in less than 30 mm.`, fixes: [{ id: "rooms", label: `${rooms} ${rooms === 1 ? "room" : "rooms"} per floor`, safe: true, apply: (q) => ({ ...q, house: { ...q.house, rooms: Math.min(q.house.rooms, rooms) } }) }] });
    }
    if (info.stairs === "too-narrow" || info.stairs === "too-shallow") {
      issues.push({
        code: "STAIRS_SKIPPED", level: "warn",
        message: info.stairs === "too-narrow" ? "The first room is too narrow for a stair, so it is left out." : "The house is too shallow for a stair this tall, so it is left out.",
        fixes: [
          { id: "no-stairs", label: "Leave out the stairs", safe: true, apply: (q) => ({ ...q, house: { ...q.house, stairs: false } }) },
          ...(info.stairs === "too-narrow" ? [{ id: "fewer-rooms", label: "One room fewer", safe: false, apply: (q: MiniatureParams) => ({ ...q, house: { ...q.house, rooms: Math.max(1, q.house.rooms - 1) } }) }] : []),
        ],
      });
    }
    if (!info.windowFit) {
      const winH = Math.max(8, Math.floor(h.floorH - 12));
      issues.push({ code: "WINDOW_TALL", level: "warn", message: `Windows ${h.winH} mm tall do not fit a ${h.floorH} mm floor; they are drawn ${winH} mm tall.`, fixes: [{ id: "winH", label: `Windows ${winH} mm tall`, safe: true, apply: (q) => ({ ...q, house: { ...q.house, winH } }) }] });
    }
    if (info.tower === "needs-flat") {
      issues.push({ code: "TOWER_FLAT", level: "warn", message: "The windcatcher stands on a flat roof; it is left out of this roof.", fixes: [{ id: "flat", label: "Flat roof", safe: false, apply: (q) => ({ ...q, house: { ...q.house, roof: "flat" } }) }, { id: "no-tower", label: "No windcatcher", safe: true, apply: (q) => ({ ...q, house: { ...q.house, tower: false } }) }] });
    }
  }
  if (p.design === "nook") {
    if ((info.sceneH ?? 999) < 90) issues.push({ code: "SCENE_LOW", level: "warn", message: `The scene is only ${(info.sceneH ?? 0).toFixed(0)} mm high; a taller nook leaves room for the buildings.`, fixes: [{ id: "taller", label: "Height 220 mm", safe: true, apply: (q) => ({ ...q, nook: { ...q.nook, height: Math.max(q.nook.height, 220) } }) }] });
    if (p.nook.width - 2 * T < 60) issues.push({ code: "NOOK_NARROW", level: "warn", message: "Less than 60 mm inside leaves little room for an alley or arches.", fixes: [{ id: "wider", label: "Width 100 mm", safe: true, apply: (q) => ({ ...q, nook: { ...q.nook, width: Math.max(q.nook.width, 100) } }) }] });
  }
  if (p.design === "furniture") {
    const s = scaleOf(p.furniture), full = T * s;
    if (info.thin) issues.push({ code: "SCALED_THIN", level: "info", message: `${info.thin} ${info.thin === 1 ? "part was" : "parts were"} made wider than the scaled size to hold ${info.thin === 1 ? "its" : "their"} joints in ${T} mm material.`, fixes: [] });
    if (full > 45) issues.push({ code: "SHEET_THICK_AT_SCALE", level: "info", message: `At 1:${Math.round(s)} a ${T} mm sheet stands for ${Math.round(full)} mm full size, so the piece looks chunky; thinner material suits this scale.`, fixes: [] });
  }
  return issues;
}
