// Theme context — provides the active color palette (light/dark) + a toggle.
// Persists the choice to localStorage on web; falls back to in-memory elsewhere.

import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { darkColors, lightColors, AppColors } from "./theme";

type Mode = "light" | "dark";

interface ThemeCtx {
  mode: Mode;
  colors: AppColors;
  toggle: () => void;
  setMode: (m: Mode) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function readStored(): Mode {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const v = window.localStorage.getItem("sir-theme");
      if (v === "light" || v === "dark") return v;
    }
  } catch {}
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readStored);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      if (typeof window !== "undefined" && window.localStorage) window.localStorage.setItem("sir-theme", m);
    } catch {}
  };
  const toggle = () => setMode(mode === "dark" ? "light" : "dark");

  const value = useMemo<ThemeCtx>(
    () => ({ mode, colors: mode === "dark" ? darkColors : lightColors, toggle, setMode }),
    [mode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
