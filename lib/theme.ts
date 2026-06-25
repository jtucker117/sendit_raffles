// Send It Raffles brand theme — Texas red / black / navy / chrome.
// Two palettes (dark + light) sharing the SAME keys, so any screen reading
// `colors.bg`, `colors.text`, etc. works in either mode. Screens get the
// active palette from `useTheme()` (lib/theme-context). The static `colors`
// export = dark, kept for screens not yet migrated to the theme hook.

export const darkColors = {
  // surfaces
  bg: "#0a0a0c",
  surface: "#14151a",
  surfaceAlt: "#1b1d24",
  border: "#262932",
  inputBorder: "#2c2f38",
  // text
  text: "#f3f4f6",
  muted: "#9aa0a6",
  faint: "#6b7280",
  // brand
  red: "#e6232f",
  redDark: "#b3151f",
  redSoft: "rgba(230,35,47,0.16)",
  navy: "#1b2b4d",
  navySoft: "rgba(27,43,77,0.4)",
  // status
  green: "#2fbf6b",
  greenSoft: "rgba(47,191,107,0.16)",
  amber: "#f4b740",
  amberSoft: "rgba(244,183,64,0.16)",
  // misc
  onAccent: "#ffffff",
  white: "#ffffff",
  black: "#000000",
};

export const lightColors: typeof darkColors = {
  // surfaces
  bg: "#f4f5f7",
  surface: "#ffffff",
  surfaceAlt: "#eef0f4",
  border: "#e6e8ec",
  inputBorder: "#d8dce2",
  // text
  text: "#0d0f14",
  muted: "#5b626c",
  faint: "#9aa0a6",
  // brand
  red: "#d11f2d",
  redDark: "#b3151f",
  redSoft: "rgba(209,31,45,0.10)",
  navy: "#1b2b4d",
  navySoft: "rgba(27,43,77,0.10)",
  // status
  green: "#1f9d57",
  greenSoft: "rgba(31,157,87,0.12)",
  amber: "#c98a00",
  amberSoft: "rgba(201,138,0,0.14)",
  // misc
  onAccent: "#ffffff",
  white: "#ffffff",
  black: "#000000",
};

// Backwards-compatible default (dark). Migrated screens use useTheme() instead.
export const colors = darkColors;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

export type AppColors = typeof darkColors;
