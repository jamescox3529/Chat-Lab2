"use client";

import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  panelRoles?: Record<string, string>;
}

export default function MessageBubble({ message, panelRoles }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] ${
          isUser
            ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl rounded-tr-sm px-4 py-2.5"
            : "bg-white dark:bg-dark-bubble border border-gray-200 dark:border-dark-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div
            className="prose text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}

        {/* Panel badges */}
        {!isUser && message.panel && message.panel.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border flex flex-wrap gap-1">
            {message.panel.map((pid) => (
              <span
                key={pid}
                className="inline-block text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded px-1.5 py-0.5"
              >
                {panelRoles?.[pid] ?? pid}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const QUESTIONS_MARKER = "To sharpen this advice, the panel needs to know:";

export function parseQuestions(content: string): { main: string; questions: string[] } {
  // Find the bold marker (with or without surrounding **)
  const markerIndex = content.indexOf(QUESTIONS_MARKER);
  if (markerIndex === -1) return { main: content, questions: [] };

  const main = content.slice(0, markerIndex).replace(/\*+\s*$/, "").trimEnd();
  const remainder = content.slice(markerIndex + QUESTIONS_MARKER.length);

  // Extract numbered items from the questions block
  const questions: string[] = [];
  const lines = remainder.split("\n");
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) questions.push(match[1].trim());
  }

  return { main, questions };
}

// Line-by-line markdown renderer
export function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      i++;
    } else if (line.startsWith("## ")) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      i++;
    } else if (line.startsWith("# ")) {
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      i++;
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        if (/^\d+\. /.test(lines[i])) {
          items.push(`<li>${inline(lines[i].replace(/^\d+\. /, ""))}</li>`);
          i++;
        } else if (lines[i].trim() === "" && i + 1 < lines.length && /^\d+\. /.test(lines[i + 1])) {
          // blank line between numbered items — skip and continue list
          i++;
        } else {
          break;
        }
      }
      out.push(`<ol>${items.join("")}</ol>`);
    } else if (line.trim() === "") {
      i++;
    } else {
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].startsWith("#") &&
        !/^[-*] /.test(lines[i]) &&
        !/^\d+\. /.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length > 0) {
        out.push(`<p>${inline(paraLines.join(" "))}</p>`);
      }
    }
  }

  return out.join("");
}

function inline(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
