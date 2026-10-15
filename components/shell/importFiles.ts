"use client";

/** File › Import… helpers shared by the editors. */

export const DRAWING = /\.(svgz?|dxf)$/i;
export const PICTURE = /^image\/(png|jpeg|webp)$/;
export const PROJECT = /\.(oclc|hingelab|json)$/i;

/** A DXF as an SVG file (mm, red cut lines), so the picture fields and Studio read it like any drawing. */
export async function dxfAsSvg(f: File): Promise<File> {
  const { dxfToSvg, readDxf } = await import("@/lib/ai/dxfRead");
  return new File([dxfToSvg(readDxf(await f.text()))], f.name.replace(/\.dxf$/i, ".svg"), { type: "image/svg+xml", lastModified: f.lastModified });
}

/** Hands `f` to a file input as if it had been picked there (its own checks and tracing run). */
export function feedFileInput(input: HTMLInputElement, f: File): boolean {
  try {
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/** Opens a drawing or picture as a new Studio project (Studio's default material and machine). */
export async function importToStudio(f: File, toast: (m: string) => void): Promise<void> {
  const [{ createProjectFromImage, createProjectFromSvg, editorPath }, { loadPrefs }] = await Promise.all([
    import("@/components/studio/projectActions"),
    import("@/lib/studio/prefs"),
  ]);
  const prefs = loadPrefs();
  try {
    toast(`Opening ${f.name} in Studio…`);
    const id = PICTURE.test(f.type)
      ? await createProjectFromImage(f, prefs.materialId, prefs.machineId)
      : (await createProjectFromSvg(f, prefs.materialId, prefs.machineId)).id;
    window.location.assign(editorPath(id));
  } catch (e) {
    toast(e instanceof Error ? e.message : `${f.name} could not be imported`);
  }
}
