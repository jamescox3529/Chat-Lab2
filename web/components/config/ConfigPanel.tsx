"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getConfigOptions, uploadDocument, deleteDocument, setAuthToken } from "@/lib/api";
import type { ConfigOptions, ConversationConfig, Document } from "@/lib/types";

interface ConfigPanelProps {
  config: ConversationConfig;
  onChange: (config: ConversationConfig) => void;
  documents: Document[];
  onDocumentsChange: (docs: Document[]) => void;
  collapsed: boolean;
  onToggle: () => void;
  roomId?: string;
}

export default function ConfigPanel({
  config, onChange, documents, onDocumentsChange, collapsed, onToggle, roomId,
}: ConfigPanelProps) {
  const { getToken } = useAuth();
  const [options, setOptions] = useState<ConfigOptions | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  useEffect(() => { getConfigOptions(roomId).then(setOptions).catch(() => {}); }, [roomId]);

  function setProfile(key: string, value: string) {
    onChange({ ...config, user_profile: { ...config.user_profile, [key]: value || undefined } });
  }
  function setProject(key: string, value: string) {
    onChange({ ...config, project_config: { ...config.project_config, [key]: value || undefined } });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded: Document[] = [];
      for (const file of files) uploaded.push(await withToken(() => uploadDocument(file)));
      const newDocs = [...documents, ...uploaded];
      onDocumentsChange(newDocs);
      onChange({ ...config, document_ids: newDocs.map((d) => d.id) });
    } catch (err) { console.error(err); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleRemoveDoc(docId: string) {
    try { await withToken(() => deleteDocument(docId)); } catch {}
    const newDocs = documents.filter((d) => d.id !== docId);
    onDocumentsChange(newDocs);
    onChange({ ...config, document_ids: newDocs.map((d) => d.id) });
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-4 border-l border-gray-300 dark:border-dark-border bg-gray-100 dark:bg-dark-config w-10">
        <button onClick={onToggle} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors" title="Open configuration">
          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-gray-300 dark:border-dark-border bg-gray-100 dark:bg-dark-config overflow-y-auto" style={{ width: "var(--config-width)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-dark-border sticky top-0 bg-gray-100 dark:bg-dark-config z-10">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-300">Configuration</span>
        <button onClick={onToggle} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors" title="Collapse">
          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* You & Your Goal */}
        <section>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider mb-1">You &amp; Your Goal</h3>
          <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">Helps the panel adjust how it responds. All optional.</p>
          {options && (
            <div className="space-y-3">
              <SelectField label="Your relationship to this subject" options={options.experience.map((o) => o.label)} value={config.user_profile.experience ?? ""} onChange={(v) => setProfile("experience", v)} />
              <SelectField label="What are you trying to do?" options={options.task.map((o) => o.label)} value={config.user_profile.task ?? ""} onChange={(v) => setProfile("task", v)} />
              <SelectField label="How to handle uncertainty?" options={options.uncertainty.map((o) => o.label)} value={config.user_profile.uncertainty ?? ""} onChange={(v) => setProfile("uncertainty", v)} />
              <SelectField label="What will you do with the answer?" options={options.use.map((o) => o.label)} value={config.user_profile.use ?? ""} onChange={(v) => setProfile("use", v)} />
            </div>
          )}
        </section>

        <div className="border-t border-gray-300 dark:border-dark-border" />

        {/* Project Context */}
        {options && options.project_fields?.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider mb-1">Project Context</h3>
            <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">All fields optional — used to ground panel responses.</p>
            <div className="space-y-3">
              {options.project_fields.map((field) => (
                <SelectField
                  key={field.key}
                  label={field.label}
                  options={field.options}
                  value={config.project_config[field.key] ?? ""}
                  onChange={(v) => setProject(field.key, v)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="border-t border-gray-300 dark:border-dark-border" />

        {/* Documents */}
        <section>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider mb-1">Documents</h3>
          <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">PDF, Word, and Excel. Read once on upload.</p>

          {documents.length > 0 && (
            <div className="space-y-2 mb-3">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-start justify-between gap-2 bg-white dark:bg-dark-bubble rounded-lg px-3 py-2 border border-gray-200 dark:border-dark-border">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-600">
                      {doc.char_count.toLocaleString()} chars
                      {doc.char_count >= 50000 && <span className="ml-1 text-amber-500">(truncated)</span>}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveDoc(doc.id)} className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700">
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
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-lg border border-dashed border-gray-400 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-600 hover:bg-white dark:hover:bg-dark-bubble transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <><Spinner />Uploading...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>Upload document</>
            )}
          </button>
        </section>
      </div>
    </div>
  );
}

function SelectField({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-bubble px-2 py-1.5 text-gray-800 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-600"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt === "" ? "— not set —" : opt}</option>
        ))}
      </select>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
