"use client";

import { renderMarkdown } from "@/components/chat/MessageBubble";

interface DebateResultViewProps {
  content: string;
  personas: string[]; // role names
}

export default function DebateResultView({ content, personas }: DebateResultViewProps) {
  return (
    <div className="bg-white dark:bg-dark-bubble border border-gray-200 dark:border-dark-border rounded-2xl px-5 py-4 shadow-sm">
      <div
        className="prose text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />

      {personas.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-dark-border">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Debate participants:</p>
          <div className="flex flex-wrap gap-1.5">
            {personas.map((role) => (
              <span
                key={role}
                className="inline-block text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded px-2 py-0.5 border border-gray-100 dark:border-dark-border"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
