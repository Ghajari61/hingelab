import { desktopJSON, requireDesktopUser } from "@/lib/desktop/http";
import { desktopCatalog } from "@/lib/desktop/products";

/** The settings panels and presets of every desktop product (plain data, no geometry). */
export async function GET(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  return desktopJSON(await desktopCatalog());
}
