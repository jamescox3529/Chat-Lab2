import type {
  Room,
  Conversation,
  ConversationSummary,
  ConversationConfig,
  Document,
  ConfigOptions,
  SSEEvent,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Auth token — set by AuthProvider on every Clerk token refresh
// ---------------------------------------------------------------------------
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

function authHeaders(): Record<string, string> {
  return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

// Rooms
export const getRooms = (): Promise<Room[]> => req("/api/rooms");
export const getRoom = (id: string): Promise<Room> => req(`/api/rooms/${id}`);

// Config options
export const getConfigOptions = (roomId?: string): Promise<ConfigOptions> =>
  req(`/api/config/options${roomId ? `?room_id=${roomId}` : ""}`);

// Conversations
export const createConversation = (
  room_id: string,
  config: Partial<ConversationConfig> = {}
): Promise<Conversation> =>
  req("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ room_id, config }),
  });

export const listConversations = (): Promise<ConversationSummary[]> =>
  req("/api/conversations");

export const getConversation = (id: string): Promise<Conversation> =>
  req(`/api/conversations/${id}`);

export const updateConversation = (
  id: string,
  patch: { title?: string; config?: Partial<ConversationConfig> }
): Promise<Conversation> =>
  req(`/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const deleteConversation = (id: string): Promise<void> =>
  req(`/api/conversations/${id}`, { method: "DELETE" });

// Documents
export const uploadDocument = async (file: File): Promise<Document> => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/documents`, {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
};

export const deleteDocument = (id: string): Promise<void> =>
  req(`/api/documents/${id}`, { method: "DELETE" });

// Streaming chat
export async function* streamChat(
  convId: string,
  message: string
): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${BASE}/api/conversations/${convId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          yield JSON.parse(raw) as SSEEvent;
        } catch {
          // malformed line — skip
        }
      }
    }
  }
}
