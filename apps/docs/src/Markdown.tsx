import { makeStyles, tokens } from "@fluentui/react-components";
import { Marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import { slug } from "./slug";

const marked = new Marked({ gfm: true });

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

const useStyles = makeStyles({
  root: {
    maxWidth: "820px",
    fontSize: tokens.fontSizeBase400,
    lineHeight: "1.7",
    color: tokens.colorNeutralForeground1,
    "& img": {
      display: "block",
      width: "100%",
      height: "auto",
      margin: `${tokens.spacingVerticalL} 0 ${tokens.spacingVerticalXXL}`,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      borderRadius: tokens.borderRadiusXLarge,
      backgroundColor: tokens.colorNeutralBackground1,
    },
    "& h1": {
      fontSize: "clamp(28px, 3.5vw, 40px)",
      lineHeight: "1.15",
      letterSpacing: "-0.02em",
      fontWeight: tokens.fontWeightBold,
      margin: `0 0 ${tokens.spacingVerticalL}`,
    },
    "& h1 + p": { fontSize: tokens.fontSizeBase500, lineHeight: "1.6", color: tokens.colorNeutralForeground2 },
    "& h2": {
      fontSize: tokens.fontSizeBase600,
      lineHeight: tokens.lineHeightBase600,
      letterSpacing: "-0.01em",
      fontWeight: tokens.fontWeightSemibold,
      margin: `48px 0 ${tokens.spacingVerticalM}`,
    },
    "& h3": { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, margin: `${tokens.spacingVerticalXXL} 0 ${tokens.spacingVerticalS}` },
    "& p, & ul, & ol": { margin: `0 0 ${tokens.spacingVerticalL}` },
    "& li": { marginBottom: tokens.spacingVerticalXS },
    "& li::marker": { color: tokens.colorBrandForeground1 },
    "& a": { color: tokens.colorBrandForegroundLink, textDecoration: "none", fontWeight: tokens.fontWeightSemibold },
    "& a:hover": { textDecoration: "underline", color: tokens.colorBrandForegroundLinkHover },
    "& strong": { fontWeight: tokens.fontWeightSemibold },
    "& code": {
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: "0.88em",
      backgroundColor: tokens.colorNeutralBackground3,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
      borderRadius: tokens.borderRadiusMedium,
      padding: "1px 6px",
    },
    "& .doc-pre": { margin: `0 0 ${tokens.spacingVerticalL}` },
    "& pre": {
      margin: 0,
      backgroundColor: tokens.colorNeutralBackground3,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      borderRadius: tokens.borderRadiusXLarge,
      padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
      overflowX: "auto",
      fontSize: tokens.fontSizeBase300,
      lineHeight: "1.6",
    },
    "& pre code": { backgroundColor: "transparent", border: "none", padding: 0, fontSize: "inherit" },
    "& table": {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      margin: `0 0 ${tokens.spacingVerticalXL}`,
      fontSize: tokens.fontSizeBase300,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      borderRadius: tokens.borderRadiusXLarge,
      overflow: "hidden",
    },
    "& th, & td": {
      textAlign: "left",
      verticalAlign: "top",
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
      borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    },
    "& tr:last-child td": { borderBottom: "none" },
    "& th": { fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorNeutralBackground3 },
    "& tbody tr:hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
    "& blockquote": {
      margin: `0 0 ${tokens.spacingVerticalL}`,
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke2}`,
      backgroundColor: tokens.colorBrandBackground2,
      borderRadius: tokens.borderRadiusLarge,
    },
    "& blockquote p:last-child": { marginBottom: 0 },
    "& hr": { border: "none", borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, margin: `${tokens.spacingVerticalXXL} 0` },
  },
});

/** Renders repository-authored markdown (bundled at build time, not user input). */
export function Markdown({ source, pageId, onHeadings }: { source: string; pageId: string; onHeadings: (h: Heading[]) => void }) {
  const styles = useStyles();
  const ref = useRef<HTMLElement>(null);
  const html = useMemo(() => marked.parse(source, { async: false }), [source]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const headings: Heading[] = [];
    root.querySelectorAll<HTMLHeadingElement>("h2, h3").forEach((h) => {
      h.querySelector(".doc-anchor")?.remove();
      const text = h.textContent ?? "";
      h.id = slug(text);
      const a = document.createElement("a");
      a.className = "doc-anchor";
      a.href = `#/${pageId}#${h.id}`;
      a.setAttribute("aria-label", `Link to ${text}`);
      a.textContent = "#";
      h.appendChild(a);
      headings.push({ id: h.id, text, level: h.tagName === "H2" ? 2 : 3 });
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.parentElement?.classList.contains("doc-pre")) return;
      const wrap = document.createElement("div");
      wrap.className = "doc-pre";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "doc-copy";
      btn.textContent = "Copy";
      btn.addEventListener("click", () => {
        void navigator.clipboard.writeText(pre.textContent ?? "").then(() => {
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1500);
        });
      });
      wrap.appendChild(btn);
    });
    onHeadings(headings);
  }, [html, pageId, onHeadings]);

  return <article ref={ref} className={`${styles.root} doc-fade`} dangerouslySetInnerHTML={{ __html: html }} />;
}
