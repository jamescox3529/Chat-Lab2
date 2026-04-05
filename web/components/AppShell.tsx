"use client";

import { usePathname } from "next/navigation";
import NavRail from "@/components/nav/NavRail";
import { useNavContext } from "@/context/NavContext";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { onNewChat, refreshTrigger } = useNavContext();

  // Auth pages have their own full-screen layout — no nav rail
  const isAuthPage =
    pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up");

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="flex h-full overflow-hidden">
      <NavRail onNewChat={onNewChat} refreshTrigger={refreshTrigger} />
      {/* Content area — flex so chat page can sit ConfigPanel as a sibling */}
      <div className="flex flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
