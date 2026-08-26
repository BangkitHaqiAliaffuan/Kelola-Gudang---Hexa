import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const themes = [
  { id: "sky", label: "Sky Blue", swatch: "oklch(0.72 0.11 235)" },
  { id: "mint", label: "Mint", swatch: "oklch(0.75 0.095 172)" },
  { id: "emerald", label: "Emerald", swatch: "oklch(0.7 0.11 155)" },
  { id: "lavender", label: "Lavender", swatch: "oklch(0.72 0.1 292)" },
  { id: "peach", label: "Peach", swatch: "oklch(0.78 0.1 32)" },
  { id: "orange", label: "Soft Orange", swatch: "oklch(0.78 0.12 55)" },
  { id: "slate", label: "Slate", swatch: "oklch(0.62 0.04 250)" },
  { id: "gray", label: "Light Gray", swatch: "oklch(0.72 0.012 265)" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

const ThemeCtx = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: "sky",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>("sky");

  useEffect(() => {
    const saved = window.localStorage.getItem("kg-theme") as ThemeId | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("kg-theme", theme);
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
