/** Removes HTML tags repeatedly so nested fragments such as "<scr<b>ipt>" cannot reassemble into a tag. */
const stripTags = (text: string) => {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<[^<>]*>/g, "");
  } while (current !== previous);
  return current.replace(/[<>]/g, "");
};

export const slug = (text: string) =>
  stripTags(text.toLowerCase())
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
