"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { listConversations, deleteConversation, setAuthToken } from "@/lib/api";
import { UserButton, useAuth } from "@clerk/nextjs";
import { useTheme } from "@/lib/useTheme";
import { useZoom } from "@/lib/useZoom";
import type { ConversationSummary } from "@/lib/types";

interface NavRailProps {
  onNewChat: () => void;
  refreshTrigger?: number;
}

export default function NavRail({ onNewChat, refreshTrigger }: NavRailProps) {
  const router = useRouter();
  const params = useParams();
  const activeId = params?.convId as string | undefined;
  const { dark, toggle } = useTheme();
  const { zoom, zoomIn, zoomOut } = useZoom();
  const { getToken, isLoaded } = useAuth();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  async function load() {
    try {
      const data = await withToken(() => listConversations());
      setConversations(data);
    } catch {}
  }

  useEffect(() => {
    if (!isLoaded) return;
    load();
  }, [isLoaded, refreshTrigger]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeleting(id);
    try {
      await withToken(() => deleteConversation(id));
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) router.push("/");
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 86400000)    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 7*86400000)  return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="flex flex-col h-full bg-gray-200 dark:bg-dark-nav border-r border-gray-300 dark:border-dark-border">

      {/* Header */}
      <div className="p-4 border-b border-gray-300 dark:border-dark-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 tracking-wide">
            Chat-Lab
          </span>
          <div className="flex items-center gap-1">
            {/* Zoom out */}
            <button
              onClick={zoomOut}
              disabled={zoom === "normal"}
              className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
              title="Smaller text"
            >
              <span className="text-xs font-semibold leading-none text-gray-600 dark:text-gray-400">A−</span>
            </button>
            {/* Zoom in */}
            <button
              onClick={zoomIn}
              disabled={zoom === "larger"}
              className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
              title="Larger text"
            >
              <span className="text-sm font-semibold leading-none text-gray-600 dark:text-gray-400">A+</span>
            </button>
            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-400 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 px-4 py-3">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => router.push(`/chat/${conv.id}`)}
              className={`group relative mx-2 my-0.5 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                activeId === conv.id
                  ? "bg-white dark:bg-dark-bubble shadow-sm border border-gray-300 dark:border-dark-border"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate pr-6 leading-snug">
                {conv.title || "New conversation"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {formatDate(conv.updated_at)}
                {conv.message_count > 0 && (
                  <span className="ml-2">
                    {conv.message_count} {conv.message_count === 1 ? "message" : "messages"}
                  </span>
                )}
              </p>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                disabled={deleting === conv.id}
                className="absolute right-2 top-2.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-300 dark:hover:bg-gray-700 transition-opacity"
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* User button — bottom of nav */}
      <div className="p-4 border-t border-gray-300 dark:border-dark-border flex items-center gap-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-7 h-7",
            },
          }}
        />
        <span className="text-xs text-gray-500 dark:text-gray-500">Account</span>
      </div>
    </div>
  );
}
