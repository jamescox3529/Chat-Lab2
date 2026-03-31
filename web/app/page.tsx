"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { getRooms, listConversations, createConversation, setAuthToken } from "@/lib/api";
import type { Room, ConversationSummary } from "@/lib/types";
import NavRail from "@/components/nav/NavRail";

export default function HomePage() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken, isLoaded } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recentConvs, setRecentConvs] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [navRefresh, setNavRefresh] = useState(0);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  useEffect(() => {
    if (!isLoaded) return;
    withToken(() => getRooms()).then(setRooms).catch(() => {});
    withToken(() => listConversations()).then((c) => setRecentConvs(c.slice(0, 5))).catch(() => {});
  }, [isLoaded]);

  async function startConversation(roomId: string) {
    setLoading(true);
    try {
      const conv = await withToken(() => createConversation(roomId, { user_profile: {}, project_config: {}, document_ids: [] }));
      setNavRefresh((n) => n + 1);
      router.push(`/chat/${conv.id}`);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div style={{ width: "var(--nav-width)", flexShrink: 0 }}>
        <NavRail onNewChat={() => {}} refreshTrigger={navRefresh} />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-12 bg-white dark:bg-dark-chat">
        <div className="w-full max-w-xl">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Good to see you{user?.firstName
              ? `, ${user.firstName}`
              : user?.username
              ? `, ${user.username}`
              : ""}.
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-10">Select a room to start a conversation with the expert panel.</p>

          <div className="space-y-3">
            {rooms.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-600">Loading rooms…</p>}
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => startConversation(room.id)}
                disabled={loading}
                className="w-full text-left p-5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-dark-bubble transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{room.name}</h2>
                    {room.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{room.description}</p>}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {recentConvs.length > 0 && (
            <div className="mt-10">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-3">Recent conversations</h3>
              <div className="space-y-1">
                {recentConvs.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => router.push(`/chat/${conv.id}`)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bubble transition-colors group"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate block">{conv.title || "New conversation"}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-600">{conv.message_count} message{conv.message_count !== 1 ? "s" : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
