"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

type SegmentedCodeInputProps = Readonly<{
  /** FormData field name. A hidden input carries the joined value under this name. */
  name: string;
  /** id of the visible label element; the box group is labelled by it. */
  labelId: string;
  /** Number of single-character boxes per visual group, e.g. [6] or [4, 4, 4, 4]. */
  groups: readonly number[];
  /** String joining groups in the submitted value (e.g. "-" for recovery codes). */
  separator?: string;
  /** Virtual keyboard hint for each box. */
  inputMode?: "numeric" | "text";
  /** Single-character allow test applied after `transform`. Rejected characters are ignored. */
  allow?: RegExp;
  /** Normalises typed/pasted characters (e.g. uppercasing). */
  transform?: (raw: string) => string;
  disabled?: boolean;
  /** id of a describing element (help or error text). */
  describedById?: string;
  autoFocus?: boolean;
  /** Reports the joined value (including separators) on every change. */
  onValueChange?: (value: string) => void;
}>;

const identity = (raw: string) => raw;

/**
 * One box per character OTP-style input. The visible boxes are presentation only;
 * a single hidden input named `name` carries the joined value so existing
 * FormData-based submit handlers keep working unchanged.
 */
export function SegmentedCodeInput({
  name,
  labelId,
  groups,
  separator = "",
  inputMode = "numeric",
  allow = /[0-9]/,
  transform = identity,
  disabled = false,
  describedById,
  autoFocus = false,
  onValueChange,
}: SegmentedCodeInputProps) {
  // The global (flat) start index of each group, derived without mutation.
  const groupStarts = groups.map((_size, groupIndex) =>
    groups.slice(0, groupIndex).reduce((sum, size) => sum + size, 0),
  );
  const total = groups.reduce((sum, size) => sum + size, 0);
  const [chars, setChars] = useState<readonly string[]>(() =>
    Array.from({ length: total }, () => ""),
  );
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const groupWrapperRef = useRef<HTMLDivElement | null>(null);

  const value = groups
    .map((size, groupIndex) => {
      const start = groupStarts[groupIndex] ?? 0;
      return chars.slice(start, start + size).join("");
    })
    .join(separator);

  useEffect(() => {
    onValueChange?.(value);
  }, [value, onValueChange]);

  // Clear the boxes when the surrounding form is reset (e.g. after a successful
  // step-up verification where the form stays mounted).
  useEffect(() => {
    const form = groupWrapperRef.current?.closest("form");
    if (!form) return undefined;
    const handleReset = () => setChars(Array.from({ length: total }, () => ""));
    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [total]);

  function focusBox(index: number) {
    const clamped = Math.max(0, Math.min(index, inputsRef.current.length - 1));
    const target = inputsRef.current[clamped];
    target?.focus();
    target?.select();
  }

  function setChar(index: number, next: string) {
    setChars((current) => {
      const draft = current.slice();
      draft[index] = next;
      return draft;
    });
  }

  function fillFrom(startIndex: number, rawText: string) {
    const accepted = Array.from(transform(rawText)).filter((character) =>
      allow.test(character),
    );
    if (accepted.length === 0) return;
    setChars((current) => {
      const draft = current.slice();
      accepted.forEach((character, offset) => {
        const target = startIndex + offset;
        if (target < draft.length) draft[target] = character;
      });
      return draft;
    });
    focusBox(startIndex + accepted.length);
  }

  function handleChange(index: number, rawValue: string) {
    if (rawValue === "") {
      setChar(index, "");
      return;
    }
    // A single accepted character advances focus; multiple characters
    // (autofill/IME) are distributed like a paste from this box.
    if (rawValue.length > 1) {
      fillFrom(index, rawValue);
      return;
    }
    const character = transform(rawValue);
    if (!allow.test(character)) return;
    setChar(index, character);
    if (index < total - 1) focusBox(index + 1);
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    switch (event.key) {
      case "Backspace":
        event.preventDefault();
        if (chars[index]) {
          setChar(index, "");
        } else if (index > 0) {
          setChar(index - 1, "");
          focusBox(index - 1);
        }
        break;
      case "Delete":
        event.preventDefault();
        setChar(index, "");
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusBox(index - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusBox(index + 1);
        break;
      default:
        break;
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fillFrom(index, event.clipboardData.getData("text"));
  }

  const boxLabel = inputMode === "numeric" ? "Digit" : "Character";

  return (
    <div
      ref={groupWrapperRef}
      className="segmented-code"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedById}
    >
      {groups.map((size, groupIndex) => (
        <div className="segmented-code__group" key={groupIndex}>
          {groupIndex > 0 && separator ? (
            <span className="segmented-code__separator" aria-hidden="true">
              {separator}
            </span>
          ) : null}
          {Array.from({ length: size }, (_unused, localIndex) => {
            const boxIndex = (groupStarts[groupIndex] ?? 0) + localIndex;
            return (
              <input
                key={boxIndex}
                ref={(element) => {
                  inputsRef.current[boxIndex] = element;
                }}
                className="segmented-code__box"
                type="text"
                inputMode={inputMode}
                autoComplete={boxIndex === 0 ? "one-time-code" : "off"}
                aria-label={`${boxLabel} ${boxIndex + 1} of ${total}`}
                maxLength={1}
                value={chars[boxIndex] ?? ""}
                disabled={disabled}
                autoFocus={autoFocus && boxIndex === 0}
                onChange={(event) => handleChange(boxIndex, event.target.value)}
                onKeyDown={(event) => handleKeyDown(boxIndex, event)}
                onPaste={(event) => handlePaste(boxIndex, event)}
                onFocus={(event) => event.target.select()}
              />
            );
          })}
        </div>
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
