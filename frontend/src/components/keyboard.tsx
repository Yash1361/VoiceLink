import React from "react";

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  suggestions?: string[];
  currentInput: string;
  onSuggestionClick?: (word: string) => void;
  selectionIndex?: number;
}

export const LETTERS = [
  "Q","W","E","R","T","Y","U","I","O","P",
  "A","S","D","F","G","H","J","K","L",
  "Z","X","C","V","B","N","M"
];

export const SPECIAL_KEYS = [
  { label: "Space", value: "Space" },
  { label: "Backspace", value: "Backspace" },
  { label: "Enter", value: "Enter" },
] as const;

export default function Keyboard({
  onKeyPress,
  suggestions = [],
  currentInput,
  onSuggestionClick,
  selectionIndex = -1, // default to no selection
}: KeyboardProps) {
  return (
    <div className="p-4 rounded-xl border bg-white shadow space-y-3">
      {/* Autocomplete Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {suggestions.map((word, index) => {
            const isActive = index === selectionIndex;
            return (
              <button
                key={word}
                onClick={() => onSuggestionClick?.(word)}
                className={`px-3 py-1 rounded text-sm ${
                  isActive
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
      )}

      {/* Current input */}
      <div className="mb-2 text-sm text-slate-900 font-medium border rounded px-2 py-1 bg-slate-50">
        {currentInput}
      </div>

      {/* Letters */}
      <div className="grid grid-cols-10 gap-2">
        {LETTERS.map((l, index) => {
          const letterOffset = suggestions.length;
          const isActive = selectionIndex === letterOffset + index;
          return (
            <button
              key={l}
              onClick={() => onKeyPress(l)}
              className={`p-2 rounded text-sm font-medium ${
                isActive
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 hover:bg-slate-200"
              }`}
            >
              {l}
            </button>
          );
        })}
      </div>

      {/* Space & Enter */}
      <div className="flex gap-2 mt-2">
        {SPECIAL_KEYS.map((key, index) => {
          const specialOffset = suggestions.length + LETTERS.length;
          const isActive = selectionIndex === specialOffset + index;
          const baseClasses = key.value === "Enter"
            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
            : "bg-slate-200 hover:bg-slate-300 text-slate-900";
          const activeClasses = "bg-emerald-500 text-white ring-2 ring-emerald-200";
          return (
            <button
              key={key.value}
              onClick={() => onKeyPress(key.value)}
              className={`flex-1 p-2 rounded text-sm font-medium transition ${
                isActive ? activeClasses : baseClasses
              }`}
            >
              {key.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
