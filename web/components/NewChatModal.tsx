"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getConfigOptions, createConversation, setAuthToken } from "@/lib/api";
import type { ConfigOptions, ConversationConfig } from "@/lib/types";

interface NewChatModalProps {
  roomId: string;
  onClose: () => void;
  onCreated: (convId: string) => void;
}

const EMPTY_CONFIG: ConversationConfig = {
  user_profile: {},
  project_config: {},
  document_ids: [],
};

export default function NewChatModal({ roomId, onClose, onCreated }: NewChatModalProps) {
  const { getToken } = useAuth();
  const [options, setOptions] = useState<ConfigOptions | null>(null);
  const [config, setConfig] = useState<ConversationConfig>(EMPTY_CONFIG);
  const [creating, setCreating] = useState(false);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  useEffect(() => {
    withToken(() => getConfigOptions(roomId)).then(setOptions).catch(() => {});
  }, [roomId]);

  function setProfile(key: string, value: string) {
    setConfig((c) => ({
      ...c,
      user_profile: { ...c.user_profile, [key]: value || undefined },
    }));
  }

  function setProject(key: string, value: string) {
    setConfig((c) => ({
      ...c,
      project_config: { ...c.project_config, [key]: value },
    }));
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const conv = await withToken(() => createConversation(roomId, config));
      onCreated(conv.id);
    } catch {
      setCreating(false);
    }
  }

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const hasProjectFields = options && (options.project_fields?.length ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md bg-white dark:bg-dark-config rounded-2xl shadow-xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New conversation</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* You & Your Goal */}
          <section>
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider mb-1">
              You &amp; Your Goal
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">
              Helps the panel adjust how it responds. All optional.
            </p>
            {options ? (
              <div className="space-y-3">
                <SelectField
                  label="Your relationship to this subject"
                  options={["", ...options.experience.map((o) => o.label)]}
                  value={config.user_profile.experience ?? ""}
                  onChange={(v) => setProfile("experience", v)}
                />
                <SelectField
                  label="What are you trying to do?"
                  options={["", ...options.task.map((o) => o.label)]}
                  value={config.user_profile.task ?? ""}
                  onChange={(v) => setProfile("task", v)}
                />
                <SelectField
                  label="How to handle uncertainty?"
                  options={["", ...options.uncertainty.map((o) => o.label)]}
                  value={config.user_profile.uncertainty ?? ""}
                  onChange={(v) => setProfile("uncertainty", v)}
                />
                <SelectField
                  label="What will you do with the answer?"
                  options={["", ...options.use.map((o) => o.label)]}
                  value={config.user_profile.use ?? ""}
                  onChange={(v) => setProfile("use", v)}
                />
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-600">Loading options…</p>
            )}
          </section>

          {hasProjectFields && (
            <>
              <div className="border-t border-gray-200 dark:border-dark-border" />
              <section>
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Project Context
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-600 mb-3">
                  All fields optional — used to ground panel responses.
                </p>
                <div className="space-y-3">
                  {options!.project_fields.map((field) => (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      options={["", ...field.options]}
                      value={config.project_config[field.key] ?? ""}
                      onChange={(v) => setProject(field.key, v)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
          >
            {creating ? "Starting…" : "Start chat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
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
          <option key={opt} value={opt}>
            {opt === "" ? "— not set —" : opt}
          </option>
        ))}
      </select>
    </div>
  );
}
