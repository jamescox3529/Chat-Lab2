"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { getPillars, setAuthToken } from "@/lib/api";
import type { Pillar } from "@/lib/types";
import { useNavContext } from "@/context/NavContext";
import Logo from "@/components/Logo";

export default function HomePage() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken, isLoaded } = useAuth();
  const { setOnNewChat } = useNavContext();
  const [pillars, setPillars] = useState<Pillar[]>([]);

  useEffect(() => {
    setOnNewChat(() => router.push("/"));
  }, []);

  async function withToken<T>(fn: () => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    setAuthToken(token);
    return fn();
  }

  useEffect(() => {
    if (!isLoaded) return;
    withToken(() => getPillars()).then(setPillars).catch(() => {});
  }, [isLoaded]);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-12 bg-white dark:bg-dark-chat relative">
        <button onClick={() => router.push("/")} className="absolute top-8 right-8" title="Home">
          <Logo size={28} />
        </button>
        <div className="w-full max-w-xl">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Good to see you{user?.firstName
              ? `, ${user.firstName}`
              : user?.username
              ? `, ${user.username}`
              : ""}.
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            Select a practice area to get started.
          </p>

          {/* Practice areas */}
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Consult</p>
          <div className="space-y-3">
            {pillars.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600">Loading…</p>
            )}
            {pillars.map((pillar) => (
              <button
                key={pillar.id}
                onClick={() => router.push(`/pillar/${pillar.id}`)}
                className="w-full text-left p-5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-dark-bubble transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                      {pillar.name}
                    </h2>
                    {pillar.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pillar.description}</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {pillars.length > 0 && (
            <>
              <div className="mt-8 mb-3">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tools</p>
              </div>
              <button
                onClick={() => router.push("/debate/new")}
                className="w-full text-left p-5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-dark-bubble transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                      Debate
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Put a question to a panel of specialists and reach a structured, reasoned conclusion.
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
  );
}
