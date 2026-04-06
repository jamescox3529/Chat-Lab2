"use client";

interface DebateProgressProps {
  status: string;
}

export default function DebateProgress({ status }: DebateProgressProps) {
  return (
    <div className="flex items-center gap-3 px-1 py-2 text-sm text-gray-500 dark:text-gray-400">
      <span className="flex gap-0.5 items-center flex-shrink-0">
        <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
      <span>{status || "Starting debate…"}</span>
    </div>
  );
}
