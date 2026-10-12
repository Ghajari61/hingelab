import type { Metadata } from "next";
import { TemplatesGallery } from "@/components/studio/pages/TemplatesGallery";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return <TemplatesGallery />;
}
