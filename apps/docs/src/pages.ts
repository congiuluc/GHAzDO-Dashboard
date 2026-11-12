import type { FluentIcon } from "@fluentui/react-icons";
import {
  BookOpenRegular,
  BoxRegular,
  BuildingRegular,
  CloudArrowUpRegular,
  DatabaseRegular,
  FilterRegular,
  GridRegular,
  HomeRegular,
  RocketRegular,
  ShieldLockRegular,
  WrenchRegular,
} from "@fluentui/react-icons";

export interface DocPage {
  id: string;
  title: string;
  group: string;
  icon: FluentIcon;
  /** Markdown file in /content (without extension). Home has a custom layout instead. */
  file?: string;
}

export const PAGES: DocPage[] = [
  { id: "home", title: "Overview", group: "Introduction", icon: HomeRegular },
  { id: "getting-started", title: "Getting started", group: "Introduction", icon: RocketRegular, file: "getting-started" },
  { id: "dashboards", title: "Dashboards", group: "Using the extension", icon: GridRegular, file: "dashboards" },
  { id: "filters", title: "Filters and drill-down", group: "Using the extension", icon: FilterRegular, file: "filters" },
  { id: "widgets", title: "Dashboard widgets", group: "Using the extension", icon: BoxRegular, file: "widgets" },
  { id: "data-modes", title: "Data and history", group: "Administration", icon: DatabaseRegular, file: "data-modes" },
  { id: "backend", title: "Shared backend", group: "Administration", icon: CloudArrowUpRegular, file: "backend" },
  { id: "security", title: "Security", group: "Administration", icon: ShieldLockRegular, file: "security" },
  { id: "development", title: "Development", group: "Contributing", icon: WrenchRegular, file: "development" },
  { id: "releases", title: "CI, releases and Pages", group: "Contributing", icon: BuildingRegular, file: "releases" },
  { id: "faq", title: "FAQ and limitations", group: "Contributing", icon: BookOpenRegular, file: "faq" },
];

const content = import.meta.glob<string>("../content/*.md", { query: "?raw", import: "default", eager: true });

export function pageMarkdown(page: DocPage): string | undefined {
  return page.file ? content[`../content/${page.file}.md`] : undefined;
}

export function findPage(id: string): DocPage {
  return PAGES.find((p) => p.id === id) ?? PAGES[0]!;
}
