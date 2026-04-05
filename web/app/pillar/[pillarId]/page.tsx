"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getPillar, setAuthToken } from "@/lib/api";
import type { PillarDetail } from "@/lib/types";
import { useNavContext } from "@/context/NavContext";

export default function PillarPage() {
  const router = useRouter();
  const params = useParams();
  const { getToken, isLoaded } = useAuth();
  const { setOnNewChat } = useNavContext();
  const pillarId = params?.pillarId as string;
  const [pillar, setPillar] = useState<PillarDetail | null>(null);

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
    if (!isLoaded || !pillarId) return;
    withToken(() => getPillar(pillarId)).then(setPillar).catch(() => {});
  }, [isLoaded, pillarId]);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10 bg-white dark:bg-dark-chat">
        <div className="w-full max-w-xl mx-auto">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-600 mb-8">
            <button onClick={() => router.push("/")} className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
              Home
            </button>
            <span>/</span>
            <span className="text-gray-600 dark:text-gray-400">{pillar?.name ?? "…"}</span>
          </nav>

          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {pillar?.name ?? "Loading…"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            Select a room to start a conversation with the expert panel.
          </p>

          <div className="space-y-3">
            {pillar && pillar.rooms.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600">No rooms in this pillar yet.</p>
            )}
            {pillar?.rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => router.push(`/room/${room.id}`)}
                className="w-full text-left p-5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-dark-bubble transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {room.name}
                    </h2>
                    {room.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{room.description}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5">
                      {room.persona_count} specialist{room.persona_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
  );
}
