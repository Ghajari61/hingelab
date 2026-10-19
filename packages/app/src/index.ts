/**
 * The app both platforms render: the start gallery and every product editor (components/editor,
 * generators, letters, parametric, shell), the routes and the session. The website mounts it from
 * its Next.js pages, the Windows app from its Vite entry; neither the app nor anything it imports
 * uses next/* or @tauri-apps/* (ESLint enforces it), only @hingelab/platform.
 */
export { default as ProductApp } from "@/components/editor/Workspace";
export * from "./routes";
export { useSession, type Session } from "./session";
