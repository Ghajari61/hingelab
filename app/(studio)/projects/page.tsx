import type { Metadata } from "next";
import ProjectsPage from "@/components/studio/pages/ProjectsPage";

export const metadata: Metadata = { title: "Projects" };

export default function Page() {
  return <ProjectsPage />;
}
