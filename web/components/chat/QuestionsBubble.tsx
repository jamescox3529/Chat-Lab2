"use client";

import { useState } from "react";

interface QuestionsBubbleProps {
  questions: string[];
  onSubmit: (formatted: string) => void;
  disabled?: boolean;
}

export default function QuestionsBubble({ questions, onSubmit, disabled }: QuestionsBubbleProps) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  function setAnswer(i: number, value: string) {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  function handleSubmit() {
    const hasAny = answers.some((a) => a.trim());
    if (!hasAny || disabled) return;

    const lines = questions.map((q, i) => {
      const answer = answers[i].trim();
      return `**${q}**\n${answer || "No answer provided."}`;
    });

    onSubmit("Answering the panel's questions:\n\n" + lines.join("\n\n"));
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[78%] w-full bg-white dark:bg-dark-bubble border border-gray-200 dark:border-dark-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm space-y-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          The panel needs to know
        </p>

        {questions.map((q, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug">{q}</p>
            <textarea
              rows={2}
              value={answers[i]}
              onChange={(e) => setAnswer(i, e.target.value)}
              disabled={disabled}
              placeholder="Your answer..."
              className="w-full resize-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 bg-gray-50 dark:bg-dark-input border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-600 disabled:opacity-50"
              style={{ minHeight: "56px" }}
            />
          </div>
        ))}

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={disabled || !answers.some((a) => a.trim())}
            className="px-4 py-1.5 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Send answers
          </button>
        </div>
      </div>
    </div>
  );
}
