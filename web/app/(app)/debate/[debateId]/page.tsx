"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getDebate, streamDebate, getAllPersonas, setAuthToken } from "@/lib/api";
import type { Debate, DebatePersona } from "@/lib/types";
import DebateProgress from "@/components/debate/DebateProgress";
import DebateResultView from "@/components/debate/DebateResultView";
import { renderMarkdown } from "@/components/chat/MessageBubble";
import { useNavContext } from "@/context/NavContext";

export default function DebatePage() {
  const params = useParams();
  const router = useRouter();
  const debateId = params?.debateId as string;
  const { getToken } = useAuth();
  const { setOnNewChat, triggerNavRefresh } = useNavContext();

  const [debate, setDebate] = useState<Debate | null>(null);
  const [personas, setPersonas] = useState<DebatePersona[]>([]);
  const [status, setStatus] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [finalResult, setFinalResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const streamStarted = useRef(false);

  useEffect(() => {
    setOnNewChat(() => router.push("/"));
  }, []);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  // Load debate and personas
  useEffect(() => {
    if (!debateId) return;

    Promise.all([
      withToken(() => getDebate(debateId)),
      withToken(() => getAllPersonas()),
    ]).then(([d, ps]) => {
      setDebate(d);
      setPersonas(ps);

      if (d.result) {
        // Already completed — show stored result
        setFinalResult(d.result);
      } else if (!streamStarted.current) {
        // Start streaming
        streamStarted.current = true;
        startStream();
      }
    }).catch((err) => {
      setError("Failed to load debate: " + String(err));
    });
  }, [debateId]);

  async function downloadReport(fmt: "docx" | "pdf") {
    if (!debateId) return;
    setDownloading(fmt);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/debates/${debateId}/report/${fmt}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `debate-report.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(null);
    }
  }

  async function startStream() {
    setStreaming(true);
    let accumulated = "";

    try {
      const token = await getToken();
      setAuthToken(token);

      for await (const event of streamDebate(debateId)) {
        if (event.type === "status") {
          setStatus(event.content);
        } else if (event.type === "token") {
          accumulated += event.content;
          setStreamingContent(accumulated);
        } else if (event.type === "done") {
          setFinalResult(accumulated);
          setStreamingContent("");
          setStatus("");
          triggerNavRefresh();
        } else if (event.type === "error") {
          setError(event.content);
        }
      }
    } catch (err) {
      setError("Connection error. Is the backend running?");
    } finally {
      setStreaming(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingContent, finalResult, status]);

  // Resolve persona role names from IDs
  const personaRoles: string[] = (debate?.persona_ids ?? []).map((pid) => {
    const found = personas.find((p) => p.id === pid);
    return found ? found.role : pid;
  });

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-dark-chat">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-dark-chat">

      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-dark-border flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
              {debate?.title || "Debate"}
            </h1>
            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Debate</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">

        {/* Show question */}
        {debate && (
          <div className="flex justify-end">
            <div className="max-w-[78%] bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl rounded-tr-sm px-4 py-2.5">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{debate.question}</p>
            </div>
          </div>
        )}

        {/* Streaming in progress */}
        {(streaming || streamingContent) && !finalResult && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-white dark:bg-dark-bubble border border-gray-200 dark:border-dark-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              {streamingContent ? (
                <div
                  className="prose text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent + "▌") }}
                />
              ) : (
                <DebateProgress status={status} />
              )}
            </div>
          </div>
        )}

        {/* Final result */}
        {finalResult && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <DebateResultView content={finalResult} personas={personaRoles} />

              {/* Download report buttons */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => downloadReport("docx")}
                  disabled={!!downloading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bubble px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {downloading === "docx" ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3" />
                    </svg>
                  )}
                  Download Word
                </button>
                <button
                  onClick={() => downloadReport("pdf")}
                  disabled={!!downloading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bubble px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {downloading === "pdf" ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3" />
                    </svg>
                  )}
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading state before debate is fetched */}
        {!debate && !error && (
          <div className="animate-pulse space-y-4">
            <div className="flex justify-end">
              <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded-2xl rounded-tr-sm w-64" />
            </div>
            <div className="flex justify-start">
              <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm w-80" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
