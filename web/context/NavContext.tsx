"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

interface NavContextValue {
  onNewChat: () => void;
  setOnNewChat: (fn: () => void) => void;
  refreshTrigger: number;
  triggerNavRefresh: () => void;
}

const NavContext = createContext<NavContextValue>({
  onNewChat: () => {},
  setOnNewChat: () => {},
  refreshTrigger: 0,
  triggerNavRefresh: () => {},
});

export function NavContextProvider({ children }: { children: ReactNode }) {
  // Store the callback in a ref so updates don't re-render the whole tree
  const onNewChatRef = useRef<() => void>(() => {});
  const [, forceUpdate] = useState(0);

  // Stable setter — pages call this in a useEffect to register their handler
  const setOnNewChat = useCallback((fn: () => void) => {
    onNewChatRef.current = fn;
    forceUpdate((n) => n + 1);
  }, []);

  const onNewChat = useCallback(() => {
    onNewChatRef.current();
  }, []);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const triggerNavRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  return (
    <NavContext.Provider value={{ onNewChat, setOnNewChat, refreshTrigger, triggerNavRefresh }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNavContext() {
  return useContext(NavContext);
}
