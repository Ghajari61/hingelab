/** Vite's import.meta.glob, declared here because the repo's tsconfig does not load vite/client. */
interface ImportMeta {
  glob<T>(pattern: string, options: { query?: string; import?: string; eager: true }): Record<string, T>;
}
