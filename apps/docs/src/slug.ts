export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

/** Strips inline markdown so headings and search snippets read as plain text. */
export const plain = (md: string) =>
  md
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)(?:[-*]|\d+\.)\s+/g, "$1")
    .replace(/[*_>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
