import { Dialog, DialogBody, DialogSurface, makeStyles, SearchBox, Text, tokens } from "@fluentui/react-components";
import { DocumentRegular, TextHeader2Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { PAGES, pageMarkdown } from "./pages";
import { plain, slug } from "./slug";

interface Entry {
  pageId: string;
  pageTitle: string;
  heading?: string;
  anchor?: string;
  text: string;
}

function buildIndex(): Entry[] {
  const entries: Entry[] = [];
  for (const page of PAGES) {
    entries.push({ pageId: page.id, pageTitle: page.title, text: page.title });
    const md = pageMarkdown(page);
    if (!md) continue;
    let current: Entry = { pageId: page.id, pageTitle: page.title, text: "" };
    for (const line of md.split(/\r?\n/)) {
      const h = /^(#{2,3})\s+(.*)$/.exec(line);
      if (h) {
        entries.push(current);
        const heading = plain(h[2]!);
        current = { pageId: page.id, pageTitle: page.title, heading, anchor: slug(heading), text: "" };
      } else if (!line.startsWith("# ")) {
        current.text += ` ${line}`;
      }
    }
    entries.push(current);
  }
  return entries.map((e) => ({ ...e, text: plain(e.text) })).filter((e) => e.text || e.heading);
}

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "calc(100vw - 32px)", padding: 0, overflow: "hidden", alignSelf: "flex-start", marginTop: "10vh" },
  body: { display: "flex", flexDirection: "column", gap: 0 },
  box: { maxWidth: "none", width: "100%", padding: tokens.spacingHorizontalM, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  list: { listStyle: "none", margin: 0, padding: tokens.spacingVerticalS, maxHeight: "55vh", overflowY: "auto" },
  item: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "flex-start",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusLarge,
    cursor: "pointer",
  },
  active: { backgroundColor: tokens.colorBrandBackground2 },
  icon: { fontSize: "18px", marginTop: "2px", color: tokens.colorBrandForeground1, flexShrink: 0 },
  snippet: { display: "block", color: tokens.colorNeutralForeground3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "520px" },
  empty: { padding: tokens.spacingHorizontalXL, color: tokens.colorNeutralForeground3, textAlign: "center" },
  mark: { backgroundColor: tokens.colorBrandBackground2, color: "inherit", borderRadius: "2px" },
});

function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - 40);
  return (start ? "…" : "") + text.slice(start, i + q.length + 80);
}

export function Search({ open, onClose, go }: { open: boolean; onClose: () => void; go: (route: string) => void }) {
  const styles = useStyles();
  const index = useMemo(buildIndex, []);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return index.filter((e) => !e.heading).slice(0, 12);
    return index
      .map((e) => {
        const score = (e.pageTitle.toLowerCase().includes(q) ? 3 : 0) + (e.heading?.toLowerCase().includes(q) ? 2 : 0) + (e.text.toLowerCase().includes(q) ? 1 : 0);
        return { e, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.e);
  }, [index, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const choose = (e: Entry) => {
    onClose();
    go(e.anchor ? `${e.pageId}#${e.anchor}` : e.pageId);
  };

  const highlight = (text: string) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className={styles.mark}>{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={styles.surface} aria-label="Search documentation">
        <DialogBody className={styles.body}>
          <SearchBox
            className={styles.box}
            size="large"
            appearance="underline"
            placeholder="Search the docs"
            value={query}
            onChange={(_, d) => setQuery(d.value)}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowDown") {
                ev.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (ev.key === "Enter" && results[active]) {
                choose(results[active]!);
              }
            }}
          />
          {results.length ? (
            <ul className={styles.list} role="listbox" aria-label="Results">
              {results.map((e, i) => {
                const Icon = e.heading ? TextHeader2Regular : DocumentRegular;
                return (
                  <li
                    key={`${e.pageId}-${e.anchor ?? ""}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`${styles.item} ${i === active ? styles.active : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(e)}
                  >
                    <Icon className={styles.icon} />
                    <span>
                      <Text weight="semibold">{highlight(e.heading ?? e.pageTitle)}</Text>
                      {e.heading && <Text size={200}> · {e.pageTitle}</Text>}
                      {q && (
                        <Text size={200} className={styles.snippet}>
                          {highlight(snippet(e.text, q))}
                        </Text>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Text className={styles.empty}>No results for “{query}”.</Text>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
