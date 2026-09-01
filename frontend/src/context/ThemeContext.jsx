import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { applyTheme, getSavedTheme, THEMES } from "@/lib/themes";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(getSavedTheme);

  const setTheme = useCallback((id) => {
    if (THEMES[id]) {
      setThemeId(id);
      applyTheme(id);
    }
  }, []);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const theme = THEMES[themeId] || THEMES.parchment;

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}
