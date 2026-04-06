"use client";

interface DepthOption {
  value: string;
  label: string;
  description: string;
  time: string;
}

const DEPTH_OPTIONS: DepthOption[] = [
  { value: "quick", label: "Quick", description: "Initial positions + synthesis.", time: "~20 seconds" },
  { value: "standard", label: "Standard", description: "+ Challenge round.", time: "~45 seconds" },
  { value: "thorough", label: "Thorough", description: "+ Convergence round.", time: "~75 seconds" },
];

interface DepthSelectorProps {
  value: string;
  onChange: (v: string) => void;
}

export default function DepthSelector({ value, onChange }: DepthSelectorProps) {
  return (
    <div className="flex gap-3">
      {DEPTH_OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 text-left px-4 py-3 rounded-xl border transition-all ${
              isSelected
                ? "border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800 shadow-sm"
                : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bubble hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <p className={`text-sm font-semibold mb-1 ${isSelected ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}>
              {opt.label}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{opt.description}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{opt.time}</p>
          </button>
        );
      })}
    </div>
  );
}
