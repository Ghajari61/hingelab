import { RELEASES } from "@/lib/desktop/http";
import { manifestError, updateFor } from "@/lib/desktop/releases";
import { parseVersion } from "@/lib/desktop/version";

/**
 * Tauri updater endpoint: 204 when the app is up to date, otherwise the newer version's signed
 * installer. The app verifies the signature with its built-in public key before installing.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ target: string; arch: string; version: string }> }) {
  const { target, arch, version } = await params;
  const current = parseVersion(version);
  if (!/^[a-z]{3,10}$/.test(target) || !/^[a-z0-9_]{3,10}$/.test(arch) || !current) {
    return Response.json({ error: "Invalid update request." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const problem = manifestError(RELEASES);
  if (problem) console.error("desktop release manifest is invalid:", problem);
  const update = problem ? null : updateFor(RELEASES, target, arch, current);
  if (!update) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  return Response.json(update, { headers: { "cache-control": "no-store" } });
}
