"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getRoom, getPillar, listConversations, deleteConversation, setAuthToken } from "@/lib/api";
import type { Room, ConversationSummary } from "@/lib/types";
import NavRail from "@/components/nav/NavRail";
import NewChatModal from "@/components/NewChatModal";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const { getToken, isLoaded } = useAuth();
  const roomId = params?.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [pillarName, setPillarName] = useState<string>("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [navRefresh, setNavRefresh] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  useEffect(() => {
    if (!isLoaded || !roomId) return;
    Promise.all([
      withToken(() => getRoom(roomId)),
      withToken(() => listConversations(roomId)),
    ])
      .then(([r, convs]) => {
        setRoom(r);
        setConversations(convs);
        if (r.pillar) {
          withToken(() => getPillar(r.pillar))
            .then((p) => setPillarName(p.name))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [isLoaded, roomId]);

  async function handleDelete(e: React.MouseEvent, convId: string) {
    e.stopPropagation();
    setDeleting(convId);
    try {
      await withToken(() => deleteConversation(convId));
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      setNavRefresh((n) => n + 1);
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

  return (
    <div className="flex h-full overflow-hidden">
      <div style={{ width: "var(--nav-width)", flexShrink: 0 }}>
        <NavRail onNewChat={() => setShowModal(true)} refreshTrigger={navRefresh} />
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-10 bg-white dark:bg-dark-chat">
        <div className="w-full max-w-xl mx-auto">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-600 mb-8">
            <button
              onClick={() => router.push("/")}
              className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
            >
              Home
            </button>
            <span>/</span>
            {pillarName && room?.pillar && (
              <>
                <button
                  onClick={() => router.push(`/pillar/${room.pillar}`)}
                  className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                >
                  {pillarName}
                </button>
                <span>/</span>
              </>
            )}
            <span className="text-gray-600 dark:text-gray-400">{room?.name ?? "…"}</span>
          </nav>

          {/* Title + New Chat button */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {room?.name ?? "Loading…"}
              </h1>
              {room?.description && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">{room.description}</p>
              )}
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </button>
          </div>

          {/* Recent conversations */}
          {conversations.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-3">
                Recent conversations
              </h2>
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="relative group"
                  >
                    <button
                      onClick={() => router.push(`/chat/${conv.id}`)}
                      className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-dark-bubble transition-all"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 pr-6">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {conv.title || "New conversation"}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                            {formatDate(conv.updated_at)}
                            {conv.message_count > 0 && (
                              <span className="ml-2">
                                {conv.message_count}{" "}
                                {conv.message_count === 1 ? "message" : "messages"}
                              </span>
                            )}
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                    {/* Delete button — appears on hover */}
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      disabled={deleting === conv.id}
                      className="absolute right-10 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all disabled:opacity-50"
                      title="Delete conversation"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {conversations.length === 0 && room && (
            <div className="py-16">
              <p className="text-sm text-gray-400 dark:text-gray-600">No conversations yet.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && room && (
        <NewChatModal
          roomId={roomId}
          onClose={() => setShowModal(false)}
          onCreated={(convId) => {
            setNavRefresh((n) => n + 1);
            router.push(`/chat/${convId}`);
          }}
        />
      )}
    </div>
  );
}
