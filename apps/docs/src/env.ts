/** Set by the Pages workflow, e.g. https://github.com/owner/repo. Empty in local builds. */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? "";
export const VERSION: string = import.meta.env.VITE_DOCS_VERSION || "dev";
