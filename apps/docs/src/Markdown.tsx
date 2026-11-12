import { makeStyles, tokens } from "@fluentui/react-components";
import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({ gfm: true });

const useStyles = makeStyles({
  root: {
    maxWidth: "860px",
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    color: tokens.colorNeutralForeground1,
    "& h1": { fontSize: tokens.fontSizeHero800, lineHeight: tokens.lineHeightHero800, fontWeight: tokens.fontWeightSemibold, margin: `0 0 ${tokens.spacingVerticalL}` },
    "& h2": {
      fontSize: tokens.fontSizeBase600,
      lineHeight: tokens.lineHeightBase600,
      fontWeight: tokens.fontWeightSemibold,
      margin: `${tokens.spacingVerticalXXL} 0 ${tokens.spacingVerticalS}`,
      paddingBottom: tokens.spacingVerticalXS,
      borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    },
    "& h3": { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, margin: `${tokens.spacingVerticalXL} 0 ${tokens.spacingVerticalXS}` },
    "& p, & ul, & ol": { margin: `0 0 ${tokens.spacingVerticalM}` },
    "& li": { marginBottom: tokens.spacingVerticalXXS },
    "& a": { color: tokens.colorBrandForegroundLink, textDecoration: "none" },
    "& a:hover": { textDecoration: "underline", color: tokens.colorBrandForegroundLinkHover },
    "& code": {
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: tokens.fontSizeBase200,
      backgroundColor: tokens.colorNeutralBackground3,
      borderRadius: tokens.borderRadiusSmall,
      padding: "1px 4px",
    },
    "& pre": {
      backgroundColor: tokens.colorNeutralBackground3,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      borderRadius: tokens.borderRadiusMedium,
      padding: tokens.spacingHorizontalM,
      overflowX: "auto",
      margin: `0 0 ${tokens.spacingVerticalM}`,
    },
    "& pre code": { backgroundColor: "transparent", padding: 0 },
    "& table": { borderCollapse: "collapse", width: "100%", margin: `0 0 ${tokens.spacingVerticalL}`, fontSize: tokens.fontSizeBase200 },
    "& th, & td": { textAlign: "left", verticalAlign: "top", padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
    "& th": { fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorNeutralBackground2 },
    "& blockquote": {
      margin: `0 0 ${tokens.spacingVerticalM}`,
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
      borderLeft: `${tokens.strokeWidthThickest} solid ${tokens.colorBrandStroke1}`,
      backgroundColor: tokens.colorBrandBackground2,
      borderRadius: tokens.borderRadiusMedium,
    },
    "& blockquote p:last-child": { marginBottom: 0 },
    "& hr": { border: "none", borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, margin: `${tokens.spacingVerticalXL} 0` },
  },
});

/** Renders repository-authored markdown (bundled at build time, not user input). */
export function Markdown({ source }: { source: string }) {
  const styles = useStyles();
  const html = useMemo(() => marked.parse(source, { async: false }), [source]);
  return <article className={styles.root} dangerouslySetInnerHTML={{ __html: html }} />;
}
