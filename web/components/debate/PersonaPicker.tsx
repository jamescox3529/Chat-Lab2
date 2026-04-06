"use client";

import { useEffect, useState } from "react";
import { getAllPersonas } from "@/lib/api";
import type { DebatePersona } from "@/lib/types";

interface PersonaPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  min: number;
  max: number;
}

export default function PersonaPicker({ selected, onChange, min, max }: PersonaPickerProps) {
  const [personas, setPersonas] = useState<DebatePersona[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllPersonas()
      .then(setPersonas)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      if (selected.length < max) {
        onChange([...selected, id]);
      }
    }
  }

  const filtered = search.trim()
    ? personas.filter((p) =>
        p.role.toLowerCase().includes(search.toLowerCase()) ||
        p.expertise.toLowerCase().includes(search.toLowerCase())
      )
    : personas;

  const atMax = selected.length >= max;
  const atMin = selected.length >= min;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {selected.length} of {min}–{max} selected
          {atMin && <span className="ml-2 text-green-600 dark:text-green-400">✓</span>}
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search specialists…"
          className="text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bubble px-3 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-600 w-48"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-600 py-4">Loading specialists…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
          {filtered.map((persona) => {
            const isSelected = selected.includes(persona.id);
            const isDisabled = !isSelected && atMax;
            return (
              <button
                key={persona.id}
                onClick={() => !isDisabled && toggle(persona.id)}
                disabled={isDisabled}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? "border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800 shadow-sm"
                    : isDisabled
                    ? "border-gray-100 dark:border-gray-800 bg-white dark:bg-dark-bubble opacity-40 cursor-not-allowed"
                    : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bubble hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold leading-snug ${isSelected ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}>
                    {persona.role}
                  </p>
                  {isSelected && (
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-900 dark:text-gray-100 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-snug line-clamp-2">
                  {persona.expertise}
                </p>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-2 text-sm text-gray-400 dark:text-gray-600 py-4">No specialists match your search.</p>
          )}
        </div>
      )}
    </div>
  );
}
