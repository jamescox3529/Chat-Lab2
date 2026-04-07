"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { listConversations, deleteConversation, listDebates, deleteDebate, setAuthToken } from "@/lib/api";
import useSWR from "swr";
import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import { useTheme } from "@/lib/useTheme";
import { useZoom } from "@/lib/useZoom";
import type { ConversationSummary, DebateSummary, NavItem } from "@/lib/types";

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const COLLAPSED_WIDTH = 40;

interface NavRailProps {
  onNewChat: () => void;
  refreshTrigger?: number;
}

export default function NavRail({ onNewChat, refreshTrigger }: NavRailProps) {
  const router = useRouter();
  const params = useParams();
  const activeConvId = params?.convId as string | undefined;
  const activeDebateId = params?.debateId as string | undefined;
  const { dark, toggle } = useTheme();
  const { zoom, zoomIn, zoomOut } = useZoom();
  const { getToken, isLoaded } = useAuth();
  const { user } = useUser();

  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NavItem | null>(null);

  // Width & collapse state — persisted to localStorage
  const [navWidth, setNavWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const widthRef = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    const savedWidth = localStorage.getItem("navWidth");
    const savedCollapsed = localStorage.getItem("navCollapsed");
    if (savedWidth) {
      const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(savedWidth)));
      setNavWidth(w);
      widthRef.current = w;
    }
    if (savedCollapsed) setCollapsed(savedCollapsed === "true");
  }, []);

  function toggleCollapse() {
    setAnimating(true);
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("navCollapsed", String(next));
    setTimeout(() => setAnimating(false), 200);
  }

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function onMouseMove(e: MouseEvent) {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      setNavWidth(newWidth);
    }

    function onMouseUp() {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem("navWidth", String(widthRef.current));
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  async function fetchNavItems(): Promise<NavItem[]> {
    const [convs, debates] = await Promise.all([
      withToken(() => listConversations()),
      withToken(() => listDebates()),
    ]);
    const convItems: NavItem[] = convs.map((c: ConversationSummary) => ({
      kind: "conversation" as const,
      ...c,
    }));
    const debateItems: NavItem[] = debates.map((d: DebateSummary) => ({
      kind: "debate" as const,
      ...d,
    }));
    return [...convItems, ...debateItems].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  // refreshTrigger in the key forces a fresh fetch after sending a message;
  // all other navigations serve instantly from the SWR cache.
  const { data: navItems = [], isLoading: navLoading, mutate } = useSWR<NavItem[]>(
    isLoaded ? `nav-items-${refreshTrigger}` : null,
    fetchNavItems,
    { revalidateOnFocus: false }
  );

  function handleDeleteClick(e: React.MouseEvent, item: NavItem) {
    e.stopPropagation();
    const hasContent = item.kind === "conversation" ? item.message_count > 0 : true;
    if (hasContent) {
      setConfirmDelete(item);
    } else {
      executeDelete(item);
    }
  }

  async function executeDelete(item: NavItem) {
    setDeleting(item.id);
    setConfirmDelete(null);
    try {
      if (item.kind === "conversation") {
        await withToken(() => deleteConversation(item.id));
        if (activeConvId === item.id) router.push("/");
      } else {
        await withToken(() => deleteDebate(item.id));
        if (activeDebateId === item.id) router.push("/");
      }
      mutate(navItems.filter((i) => i.id !== item.id), false);
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function getItemLabel(item: NavItem): string {
    if (item.kind === "conversation") return item.room_name || "";
    return "Debate";
  }

  function isActive(item: NavItem): boolean {
    if (item.kind === "conversation") return activeConvId === item.id;
    return activeDebateId === item.id;
  }

  function navigateTo(item: NavItem) {
    if (item.kind === "conversation") router.push(`/chat/${item.id}`);
    else router.push(`/debate/${item.id}`);
  }

  function getTitle(item: NavItem): string {
    if (item.title) return item.title;
    if (item.kind === "conversation") return "New conversation";
    return "New debate";
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : navWidth;

  return (
    <div
      className="relative h-full flex-shrink-0"
      style={{
        width: effectiveWidth,
        transition: animating ? "width 0.18s ease" : "none",
      }}
    >
      {/* ── Collapsed strip ─────────────────────────────────────── */}
      {collapsed && (
        <div className="flex flex-col h-full bg-gray-200 dark:bg-dark-nav border-r border-gray-300 dark:border-dark-border items-center pt-3 gap-2 overflow-hidden">
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Expanded nav ────────────────────────────────────────── */}
      {!collapsed && (
        <div className="flex flex-col h-full bg-gray-200 dark:bg-dark-nav border-r border-gray-300 dark:border-dark-border overflow-hidden">

          {/* Header */}
          <div className="p-4 border-b border-gray-300 dark:border-dark-border flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div
                style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: "#2A7A72", flexShrink: 0 }}
              />
              <div className="flex items-center gap-1">
                <button onClick={zoomOut} disabled={zoom === "normal"} className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-30" title="Smaller text">
                  <span className="text-xs font-semibold leading-none text-gray-600 dark:text-gray-400">A−</span>
                </button>
                <button onClick={zoomIn} disabled={zoom === "larger"} className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-30" title="Larger text">
                  <span className="text-sm font-semibold leading-none text-gray-600 dark:text-gray-400">A+</span>
                </button>
                <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors" title={dark ? "Light mode" : "Dark mode"}>
                  {dark ? (
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>
                {/* Collapse button */}
                <button onClick={toggleCollapse} className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors" title="Collapse sidebar">
                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              onClick={onNewChat}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-400 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="truncate">New conversation</span>
            </button>
          </div>

          {/* Nav item list */}
          <div className="flex-1 overflow-y-auto py-2 min-h-0">
            {navLoading ? (
              <div className="px-2 py-1 space-y-1 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="mx-0 my-0.5 rounded-lg px-3 py-2.5">
                    <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-4/5 mb-1.5" />
                    <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded w-2/5" />
                  </div>
                ))}
              </div>
            ) : navItems.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 px-4 py-3">No conversations yet</p>
            ) : (
              navItems.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  onClick={() => navigateTo(item)}
                  className={`group relative mx-2 my-0.5 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    isActive(item)
                      ? "bg-white dark:bg-dark-bubble shadow-sm border border-gray-300 dark:border-dark-border"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate pr-6 leading-snug">
                    {getTitle(item)}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate pr-6">
                    {formatDate(item.updated_at)}
                    {getItemLabel(item) && <span className="ml-2">{getItemLabel(item)}</span>}
                  </p>
                  <button
                    onClick={(e) => handleDeleteClick(e, item)}
                    disabled={deleting === item.id}
                    className="absolute right-2 top-2.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-300 dark:hover:bg-gray-700 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Confirm delete overlay */}
                  {confirmDelete?.id === item.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 flex items-center justify-between px-3 rounded-lg bg-white dark:bg-dark-bubble border border-gray-300 dark:border-dark-border z-10"
                    >
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">Are you sure?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          No
                        </button>
                        <button
                          onClick={() => executeDelete(item)}
                          className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                        >
                          Yes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* User */}
          <div className="p-4 border-t border-gray-300 dark:border-dark-border flex items-center gap-3 flex-shrink-0">
            <UserButton appearance={{ elements: { avatarBox: "w-7 h-7" } }} />
            <span className="text-xs text-gray-500 dark:text-gray-500 truncate">{user?.firstName ?? user?.username ?? "Account"}</span>
          </div>
        </div>
      )}

      {/* ── Drag handle ─────────────────────────────────────────── */}
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize group z-10"
          title="Drag to resize"
        >
          {/* Visible highlight on hover */}
          <div className="w-full h-full opacity-0 group-hover:opacity-100 bg-gray-400 dark:bg-gray-600 transition-opacity" />
        </div>
      )}
    </div>
  );
}
