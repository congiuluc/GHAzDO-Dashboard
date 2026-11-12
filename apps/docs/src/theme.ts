import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from "@fluentui/react-components";

/** Indigo brand ramp used by the docs site. */
const brand: BrandVariants = {
  10: "#060618",
  20: "#121331",
  30: "#1B1D4F",
  40: "#222668",
  50: "#293081",
  60: "#303A99",
  70: "#3845B0",
  80: "#4152C6",
  90: "#4C5FDA",
  100: "#5B6DE5",
  110: "#6C7CEA",
  120: "#7E8BEE",
  130: "#909BF2",
  140: "#A3ABF5",
  150: "#B6BCF8",
  160: "#C9CDFB",
};

export const lightTheme: Theme = {
  ...createLightTheme(brand),
  colorBrandBackground2: "#EEF0FE",
  colorBrandBackground2Hover: "#E3E6FD",
  colorBrandBackground2Pressed: "#D6DAFC",
};

export const darkTheme: Theme = {
  ...createDarkTheme(brand),
  colorBrandForeground1: brand[120],
  colorBrandForeground2: brand[130],
  colorBrandForegroundLink: brand[130],
  colorBrandForegroundLinkHover: brand[140],
  colorNeutralBackground1: "#16171d",
  colorNeutralBackground2: "#101116",
  colorNeutralBackground3: "#1e2029",
};
