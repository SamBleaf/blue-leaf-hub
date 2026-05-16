import { createContext, useCallback, useContext, useRef, useState } from "react";

const BlueprintContext = createContext(null);

/**
 * Provides { screenContext, setScreenContext } to the whole app.
 * Pages call setScreenContext({ page, jobId, jobAddress, ... }) when they mount
 * so Blueprint always knows what's on screen.
 */
export function BlueprintProvider({ children }) {
  const [screenContext, setScreenContextRaw] = useState(null);
  const timerRef = useRef(null);

  const setScreenContext = useCallback((ctx) => {
    // Debounce rapid navigation
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setScreenContextRaw(ctx), 80);
  }, []);

  return (
    <BlueprintContext.Provider value={{ screenContext, setScreenContext }}>
      {children}
    </BlueprintContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBlueprintContext() {
  return useContext(BlueprintContext);
}
