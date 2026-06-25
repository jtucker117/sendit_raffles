// Send It Raffles brand theme — Texas red / black / navy / chrome.
// Single source of truth for colors so every screen stays on-brand.
// The app is dark by default (the logo lives on black).

export const colors = {
  // surfaces
  bg: "#0a0a0c",          // app background (near-black)
  surface: "#14151a",      // cards / panels
  surfaceAlt: "#1b1d24",   // raised / input fills
  border: "#262932",       // hairlines / borders
  inputBorder: "#2c2f38",

  // text
  text: "#f3f4f6",         // primary text (chrome white)
  muted: "#9aa0a6",        // secondary text
  faint: "#6b7280",        // tertiary

  // brand
  red: "#e6232f",          // primary accent (Texas red)
  redDark: "#b3151f",
  redSoft: "rgba(230,35,47,0.16)",
  navy: "#1b2b4d",         // secondary
  navySoft: "rgba(27,43,77,0.4)",

  // status
  green: "#2fbf6b",
  greenSoft: "rgba(47,191,107,0.16)",
  amber: "#f4b740",
  amberSoft: "rgba(244,183,64,0.16)",

  // misc
  onAccent: "#ffffff",     // text on red/colored buttons
  white: "#ffffff",
  black: "#000000",
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

export type AppColors = typeof colors;
