import { redirect } from "next/navigation";

/** Until the marketing site exists, the home page opens the editor. */
export default function HomePage() {
  redirect("/app/editor/local");
}
