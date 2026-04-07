"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getConversation, updateConversation, streamChat, setAuthToken, getRoom, getConfigOptions, getDocuments } from "@/lib/api";
import type { Conversation, ConversationConfig, ConfigOptions, Document, Message } from "@/lib/types";
import MessageBubble, { renderMarkdown, parseQuestions } from "./MessageBubble";
import Link from "next/link";
import Logo from "@/components/Logo";
import StatusBar from "./StatusBar";
import QuestionsBubble from "./QuestionsBubble";
import ConfigPanel from "@/components/config/ConfigPanel";
import { useNavContext } from "@/context/NavContext";

interface ChatInterfaceProps {
  convId: string;
  onNewChat: () => void;
  navRefreshTrigger?: number;
}

const EMPTY_CONFIG: ConversationConfig = {
  user_profile: {},
  project_config: {},
  document_ids: [],
};

export default function ChatInterface({ convId, onNewChat, navRefreshTrigger }: ChatInterfaceProps) {
  const { getToken } = useAuth();
  const { setOnNewChat, triggerNavRefresh } = useNavContext();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [roomName, setRoomName] = useState<string>("");
  const [configOptions, setConfigOptions] = useState<ConfigOptions | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [config, setConfig] = useState<ConversationConfig>(EMPTY_CONFIG);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [panelRoles, setPanelRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    setOnNewChat(onNewChat);
  }, [onNewChat]);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!convId) return;
    withToken(() => getConversation(convId)).then((c) => {
      setConv(c);
      setMessages(c.messages);
      setConfig(c.config ?? EMPTY_CONFIG);
      const docIds = (c.config?.document_ids ?? []) as string[];
      Promise.all([
        withToken(() => getRoom(c.room_id)).catch(() => null),
        withToken(() => getConfigOptions(c.room_id)).catch(() => null),
        docIds.length ? withToken(() => getDocuments(docIds)).catch(() => []) : Promise.resolve([]),
      ]).then(([room, options, docs]) => {
        if (room) {
          setRoomName(room.name);
          if (room.personas) {
            const map: Record<string, string> = {};
            for (const p of room.personas) map[p.id] = p.role;
            setPanelRoles(map);
          }
        }
        if (options) setConfigOptions(options);
        if (docs && (docs as Document[]).length) setDocuments(docs as Document[]);
      });
    });
  }, [convId]);

  useEffect(() => {
    if (!convId || !conv) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      withToken(() => updateConversation(convId, { config })).catch(() => {});
    }, 800);
  }, [config]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, status]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  async function handleSend() {
    await handleSendText(input);
  }

  async function handleSendText(raw: string) {
    const text = raw.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);
    setStatus("");
    setStreamingContent("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      panel: [],
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    let fullContent = "";
    let finalPanel: string[] = [];
    let messageId = "";

    try {
      const token = await getToken();
      setAuthToken(token);
      for await (const event of streamChat(convId, text)) {
        if (event.type === "status")      setStatus(event.content);
        else if (event.type === "token")  { fullContent += event.content; setStreamingContent(fullContent); }
        else if (event.type === "done")   { finalPanel = event.panel; messageId = event.message_id; }
        else if (event.type === "error")  setStatus("Error: " + event.content);
      }
    } catch {
      setStatus("Connection error. Is the backend running?");
    }

    if (fullContent) {
      setMessages((prev) => [...prev, {
        id: messageId || crypto.randomUUID(),
        role: "assistant",
        content: fullContent,
        panel: finalPanel,
        timestamp: new Date().toISOString(),
      }]);
    }

    setStreamingContent("");
    setStatus("");
    setStreaming(false);
    triggerNavRefresh();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <>
      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-dark-chat">

        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-dark-border flex items-center justify-between flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {roomName || conv?.title || ""}
          </h1>
          <Link href="/" title="Home"><Logo size={22} /></Link>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 dark:text-gray-600 text-sm">Ask the panel a question to get started.</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1;
            const parsed = msg.role === "assistant" ? parseQuestions(msg.content) : null;
            const displayMsg = parsed ? { ...msg, content: parsed.main } : msg;
            const pendingQuestions =
              isLastAssistant && !streaming && parsed && parsed.questions.length > 0
                ? parsed.questions
                : null;

            return (
              <div key={msg.id} className="space-y-3">
                <MessageBubble message={displayMsg} panelRoles={panelRoles} />
                {pendingQuestions && (
                  <QuestionsBubble
                    questions={pendingQuestions}
                    disabled={streaming}
                    onSubmit={(formatted) => {
                      setInput(formatted);
                      // send immediately
                      handleSendText(formatted);
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* Streaming bubble */}
          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[78%] bg-white dark:bg-dark-bubble border border-gray-200 dark:border-dark-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                {streamingContent ? (
                  <div
                    className="prose text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent + "▌") }}
                  />
                ) : (
                  <StatusBar status={status || "Consulting panel..."} />
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border flex-shrink-0">
          <div className="flex items-end gap-3 bg-white dark:bg-dark-input border border-gray-300 dark:border-dark-border rounded-xl px-4 py-2.5 focus-within:border-gray-400 dark:focus-within:border-gray-600 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
              placeholder="Ask the panel a question..."
              className="flex-1 resize-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none bg-transparent leading-relaxed"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="flex-shrink-0 p-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5 px-1">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>

      {/* Config panel — read-only once chat is created */}
      <ConfigPanel
        config={config}
        onChange={setConfig}
        documents={documents}
        onDocumentsChange={setDocuments}
        collapsed={configCollapsed}
        onToggle={() => setConfigCollapsed((c) => !c)}
        options={configOptions}
        readOnly
      />
    </>
  );
}
