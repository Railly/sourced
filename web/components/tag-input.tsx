"use client";

import { X } from "@phosphor-icons/react";
import { type KeyboardEvent, useState } from "react";

/**
 * A tag/chip input over a newline-separated string value. Each entry renders as
 * a removable pill; Enter or comma commits the draft. Used for diagnoses and
 * allergies so clinical context reads as discrete, editable items instead of a
 * free-text box.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  emptyHint,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  emptyHint?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const tags = value.split("\n").map((tag) => tag.trim()).filter(Boolean);

  function setTags(next: string[]): void {
    onChange(next.join("\n"));
  }

  function commit(): void {
    const entry = draft.trim();
    if (!entry) return;
    if (!tags.some((tag) => tag.toLowerCase() === entry.toLowerCase())) setTags([...tags, entry]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  return (
    <div
      className="mt-1 flex min-h-[86px] flex-wrap content-start gap-1.5 rounded-md border border-hairline-strong bg-paper px-2.5 py-2 focus-within:border-info focus-within:ring-2 focus-within:ring-info-border"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.querySelector("input")?.focus();
      }}
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-paper-raised py-0.5 pl-2.5 pr-1 text-[12px] leading-none text-ink"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => setTags(tags.filter((_, itemIndex) => itemIndex !== index))}
            className="rounded-full p-0.5 text-ink-faint hover:bg-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info"
          >
            <X className="h-3 w-3" weight="bold" />
          </button>
        </span>
      ))}
      <input
        id={id}
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[8ch] flex-1 bg-transparent py-0.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
      />
      {tags.length === 0 && emptyHint ? (
        <span className="sr-only">{emptyHint}</span>
      ) : null}
    </div>
  );
}
