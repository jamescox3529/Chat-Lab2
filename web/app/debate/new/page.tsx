"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { setAuthToken, createDebate, uploadDocument, deleteDocument } from "@/lib/api";
import type { Document } from "@/lib/types";
import PersonaPicker from "@/components/debate/PersonaPicker";
import DepthSelector from "@/components/debate/DepthSelector";
import { useNavContext } from "@/context/NavContext";

export default function NewDebatePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { setOnNewChat } = useNavContext();

  const [question, setQuestion] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [depth, setDepth] = useState("standard");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOnNewChat(() => router.push("/"));
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(ta.scrollHeight, 80) + "px";
  }, [question]);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded: Document[] = [];
      for (const file of files) uploaded.push(await withToken(() => uploadDocument(file)));
      setDocuments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemoveDoc(docId: string) {
    try { await withToken(() => deleteDocument(docId)); } catch {}
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }

  async function handleStart() {
    const q = question.trim();
    if (!q || selectedPersonas.length < 2 || submitting) return;
    setSubmitting(true);
    try {
      const debate = await withToken(() =>
        createDebate({
          question: q,
          persona_ids: selectedPersonas,
          depth,
          document_ids: documents.map((d) => d.id),
        })
      );
      router.push(`/debate/${debate.id}`);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  const canStart = question.trim().length > 0 && selectedPersonas.length >= 2 && !submitting;

  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-dark-chat">
      <div className="max-w-2xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">New Debate</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Put a question to a panel of specialists and reach a reasoned conclusion.
          </p>
        </div>

        <div className="space-y-8">

          {/* Question */}
          <section>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Question
            </label>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What question should the panel debate?"
              rows={3}
              className="w-full text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 bg-white dark:bg-dark-bubble border border-gray-300 dark:border-dark-border rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-600 resize-none leading-relaxed transition-all"
              style={{ minHeight: "80px" }}
            />
          </section>

          {/* Specialists */}
          <section>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Select specialists
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose 2–5 specialists from across the platform.
            </p>
            <PersonaPicker
              selected={selectedPersonas}
              onChange={setSelectedPersonas}
              min={2}
              max={5}
            />
          </section>

          {/* Depth */}
          <section>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Depth
            </label>
            <DepthSelector value={depth} onChange={setDepth} />
          </section>

          {/* Documents */}
          <section>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Documents <span className="text-xs font-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              PDF, Word, and Excel — read once on upload.
            </p>

            {documents.length > 0 && (
              <div className="space-y-2 mb-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-start justify-between gap-2 bg-gray-50 dark:bg-dark-bubble rounded-lg px-3 py-2 border border-gray-200 dark:border-dark-border">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{doc.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-600">
                        {doc.char_count.toLocaleString()} chars
                        {doc.char_count >= 50000 && <span className="ml-1 text-amber-500">(truncated)</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveDoc(doc.id)}
                      className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.xls" multiple className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-bubble transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Uploading…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload document
                </>
              )}
            </button>
          </section>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Starting…" : "Start Debate"}
          </button>

          {selectedPersonas.length > 0 && selectedPersonas.length < 2 && (
            <p className="text-xs text-center text-gray-400 dark:text-gray-600">
              Select at least 2 specialists to start.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
