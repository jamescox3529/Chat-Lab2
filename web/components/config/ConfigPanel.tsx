"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { uploadDocument, deleteDocument, setAuthToken } from "@/lib/api";
import type { ConfigOptions, ConversationConfig, Document } from "@/lib/types";

interface ConfigPanelProps {
  config: ConversationConfig;
  onChange: (config: ConversationConfig) => void;
  documents: Document[];
  onDocumentsChange: (docs: Document[]) => void;
  collapsed: boolean;
  onToggle: () => void;
  options: ConfigOptions | null;
  readOnly?: boolean;
  // Report generation
  assistantMessageCount?: number;
  roomName?: string;
  onGenerateReport?: (title: string, format: "docx" | "pdf") => Promise<void>;
  generating?: boolean;
  generateError?: string | null;
}

export default function ConfigPanel({
  config, onChange, documents, onDocumentsChange, collapsed, onToggle, options, readOnly = false,
  assistantMessageCount = 0, roomName = "", onGenerateReport, generating = false, generateError = null,
}: ConfigPanelProps) {
  const { getToken } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Report modal state
  const [showModal, setShowModal] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportFormat, setReportFormat] = useState<"docx" | "pdf">("docx");

  const canGenerate = assistantMessageCount >= 4;

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  function setProfile(key: string, value: string) {
    onChange({ ...config, user_profile: { ...config.user_profile, [key]: value || undefined } });
  }
  function setProject(key: string, value: string) {
    onChange({ ...config, project_config: { ...config.project_config, [key]: value } });
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

  function openModal() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dateStr = `${day} ${months[now.getMonth()]} ${now.getFullYear()}`;
    setReportTitle(`${roomName || "Roundtable"} — ${dateStr}`);
    setReportFormat("docx");
    setShowModal(true);
  }

  async function handleGenerate() {
    if (!onGenerateReport) return;
    setShowModal(false);
    await onGenerateReport(reportTitle, reportFormat);
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
    <>
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

          {/* Generate Report button — only shown when in readOnly (active conversation) */}
          {readOnly && onGenerateReport && (
            <section>
              <button
                onClick={canGenerate ? openModal : undefined}
                disabled={!canGenerate || generating}
                title={!canGenerate ? "Continue the conversation to generate a report" : undefined}
                className={[
                  "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  canGenerate && !generating
                    ? "bg-[#4A8B8C] hover:bg-[#3d7576] text-white cursor-pointer"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed",
                ].join(" ")}
              >
                {generating ? (
                  <><Spinner /><span>Generating report…</span></>
                ) : (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Generate Report</span>
                  </>
                )}
              </button>
              {generateError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400 text-center">{generateError}</p>
              )}
            </section>
          )}

          {/* You & Your Goal */}
          <section>
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider mb-1">You &amp; Your Goal</h3>
            {readOnly
              ? <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">Set when this conversation was created.</p>
              : <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">Helps the panel adjust how it responds. All optional.</p>
            }
            {options && (
              <div className="space-y-3">
                {readOnly ? (
                  <>
                    <ReadOnlyField label="Your relationship to this subject" value={config.user_profile.experience} />
                    <ReadOnlyField label="What are you trying to do?" value={config.user_profile.task} />
                    <ReadOnlyField label="How to handle uncertainty?" value={config.user_profile.uncertainty} />
                    <ReadOnlyField label="What will you do with the answer?" value={config.user_profile.use} />
                  </>
                ) : (
                  <>
                    <SelectField label="Your relationship to this subject" options={options.experience.map((o) => o.label)} value={config.user_profile.experience ?? ""} onChange={(v) => setProfile("experience", v)} />
                    <SelectField label="What are you trying to do?" options={options.task.map((o) => o.label)} value={config.user_profile.task ?? ""} onChange={(v) => setProfile("task", v)} />
                    <SelectField label="How to handle uncertainty?" options={options.uncertainty.map((o) => o.label)} value={config.user_profile.uncertainty ?? ""} onChange={(v) => setProfile("uncertainty", v)} />
                    <SelectField label="What will you do with the answer?" options={options.use.map((o) => o.label)} value={config.user_profile.use ?? ""} onChange={(v) => setProfile("use", v)} />
                  </>
                )}
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
                {options.project_fields.map((field) =>
                  readOnly ? (
                    <ReadOnlyField
                      key={field.key}
                      label={field.label}
                      value={config.project_config[field.key]}
                    />
                  ) : (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      options={field.options}
                      value={config.project_config[field.key] ?? ""}
                      onChange={(v) => setProject(field.key, v)}
                    />
                  )
                )}
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

      {/* Report generation modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-sm bg-white dark:bg-dark-config rounded-2xl shadow-xl flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Generate Report</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5">

              {/* Report title */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">
                  Report title
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-bubble px-3 py-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A8B8C]"
                />
              </div>

              {/* Format selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-2">
                  Format
                </label>
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden text-sm">
                  {(["docx", "pdf"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setReportFormat(fmt)}
                      className={[
                        "flex-1 py-2 font-medium transition-colors",
                        reportFormat === fmt
                          ? "bg-[#4A8B8C] text-white"
                          : "bg-white dark:bg-dark-bubble text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800",
                      ].join(" ")}
                    >
                      {fmt === "docx" ? "Word" : "PDF"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-5">
              <button
                onClick={handleGenerate}
                disabled={!reportTitle.trim()}
                className="w-full py-2.5 rounded-lg bg-[#4A8B8C] hover:bg-[#3d7576] text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">{label}</p>
      <p className="text-xs text-gray-800 dark:text-gray-300 px-2 py-1.5 bg-white dark:bg-dark-bubble rounded-md border border-gray-200 dark:border-dark-border">
        {value || <span className="text-gray-400 dark:text-gray-600">— not set —</span>}
      </p>
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
    <svg className="w-4 h-4 animate-spin text-current flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
