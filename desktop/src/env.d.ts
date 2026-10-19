/** Vite's import.meta additions, declared here because the repo's tsconfig does not load vite/client. */
interface ImportMeta {
  glob<T>(pattern: string, options: { query?: string; import?: string; eager: true }): Record<string, T>;
  readonly env: { readonly DEV: boolean; readonly PROD: boolean; readonly MODE: string };
}
