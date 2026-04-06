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

// Preferred pillar display order
const PILLAR_ORDER = [
  "Infrastructure & Engineering",
  "Strategy & Advisory",
  "People & Organisation",
  "Digital & Technology",
];

export default function PersonaPicker({ selected, onChange, min, max }: PersonaPickerProps) {
  const [personas, setPersonas] = useState<DebatePersona[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openPillars, setOpenPillars] = useState<Set<string>>(new Set());

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
      if (selected.length < max) onChange([...selected, id]);
    }
  }

  function togglePillar(pillar: string) {
    setOpenPillars((prev) => {
      const next = new Set(prev);
      next.has(pillar) ? next.delete(pillar) : next.add(pillar);
      return next;
    });
  }

  const atMax = selected.length >= max;
  const atMin = selected.length >= min;

  const isSearching = search.trim().length > 0;

  // Group personas by pillar
  const grouped: Record<string, DebatePersona[]> = {};
  for (const p of personas) {
    const key = p.pillar_name || "Other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  // Sorted pillar list
  const pillars = [
    ...PILLAR_ORDER.filter((p) => grouped[p]),
    ...Object.keys(grouped).filter((p) => !PILLAR_ORDER.includes(p)),
  ];

  // Flat filtered list for search
  const filtered = isSearching
    ? personas.filter(
        (p) =>
          p.role.toLowerCase().includes(search.toLowerCase()) ||
          p.expertise.toLowerCase().includes(search.toLowerCase()) ||
          p.room_name.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div>
      {/* Header row */}
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
      ) : isSearching ? (
        /* ── Search results (flat) ── */
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              isSelected={selected.includes(p.id)}
              isDisabled={!selected.includes(p.id) && atMax}
              onToggle={toggle}
              showRoom
            />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-2 text-sm text-gray-400 dark:text-gray-600 py-4">
              No specialists match your search.
            </p>
          )}
        </div>
      ) : (
        /* ── Grouped by pillar ── */
        <div className="space-y-2">
          {pillars.map((pillar) => {
            const isOpen = openPillars.has(pillar);
            const items = grouped[pillar] || [];
            const selectedInPillar = items.filter((p) => selected.includes(p.id)).length;

            return (
              <div key={pillar} className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
                {/* Pillar header */}
                <button
                  onClick={() => togglePillar(pillar)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {pillar}
                    </span>
                    {selectedInPillar > 0 && (
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-full px-1.5 py-0.5">
                        {selectedInPillar}
                      </span>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Persona grid */}
                {isOpen && (
                  <div className="grid grid-cols-2 gap-2 p-2 bg-white dark:bg-dark-bubble">
                    {items.map((p) => (
                      <PersonaCard
                        key={p.id}
                        persona={p}
                        isSelected={selected.includes(p.id)}
                        isDisabled={!selected.includes(p.id) && atMax}
                        onToggle={toggle}
                        showRoom
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  persona,
  isSelected,
  isDisabled,
  onToggle,
  showRoom,
}: {
  persona: DebatePersona;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (id: string) => void;
  showRoom?: boolean;
}) {
  return (
    <button
      onClick={() => !isDisabled && onToggle(persona.id)}
      disabled={isDisabled}
      className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
        isSelected
          ? "border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800 shadow-sm"
          : isDisabled
          ? "border-gray-100 dark:border-gray-800 opacity-40 cursor-not-allowed"
          : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer"
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
      {showRoom && persona.room_name && (
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">{persona.room_name}</p>
      )}
    </button>
  );
}
