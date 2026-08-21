"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type BrandedSelectOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

type BrandedSelectProps = Readonly<{
  name?: string;
  label: string;
  options: readonly BrandedSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}>;

export function BrandedSelect({
  name,
  label,
  options,
  value: controlledValue,
  defaultValue = "",
  onChange,
  required,
  disabled,
  className,
}: BrandedSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const enhanced = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<CSSProperties>();
  const value = controlledValue ?? internalValue;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !popover.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function commit(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function openMenu() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const mobile =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(max-width: 767px)").matches
          : window.innerWidth <= 767;
      setPlacement(
        mobile
          ? { inset: "auto 0 0", width: "100%" }
          : {
              top: rect.bottom + 8,
              left: Math.min(
                rect.left,
                window.innerWidth - Math.max(rect.width, 320) - 20,
              ),
              width: Math.max(rect.width, 320),
            },
      );
    }
    setOpen(true);
    setActiveIndex(selectedIndex);
  }

  function move(direction: 1 | -1) {
    let next = activeIndex;
    do next = (next + direction + options.length) % options.length;
    while (options[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
      } else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        const option = options[activeIndex];
        if (option && !option.disabled) commit(option.value);
      } else {
        openMenu();
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openMenu();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const query = event.key.toLocaleLowerCase();
      const match = options.findIndex(
        (option) =>
          !option.disabled &&
          option.label.toLocaleLowerCase().startsWith(query),
      );
      if (match >= 0) {
        event.preventDefault();
        openMenu();
        setActiveIndex(match);
      }
    }
  }

  return (
    <div
      ref={root}
      className={["brand-select", className].filter(Boolean).join(" ")}
      onReset={() => {
        if (controlledValue === undefined) setInternalValue(defaultValue);
        setOpen(false);
      }}
    >
      <label
        id={`${id}-label`}
        className="brand-field-label"
        htmlFor={`${id}-native`}
      >
        {label}
      </label>
      <select
        id={`${id}-native`}
        className={
          enhanced ? "brand-select__native is-enhanced" : "brand-select__native"
        }
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        aria-hidden={enhanced || undefined}
        tabIndex={enhanced ? -1 : undefined}
        onChange={(event) => {
          if (controlledValue === undefined)
            setInternalValue(event.target.value);
          onChange?.(event.target.value);
        }}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {enhanced ? (
        <>
          <button
            ref={trigger}
            type="button"
            className="brand-select__trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-label={`${label}: ${selected?.label ?? "—"}`}
            disabled={disabled}
            onClick={() => {
              if (open) setOpen(false);
              else openMenu();
            }}
            onKeyDown={handleKeyDown}
          >
            <span>{selected?.label ?? "—"}</span>
            <span className="brand-select__glyph" aria-hidden="true" />
          </button>
          {open
            ? createPortal(
                <div
                  ref={popover}
                  className="brand-popover brand-select__popover is-portal"
                  style={placement}
                >
                  <div className="brand-popover__head" aria-hidden="true">
                    <span>AMANOR / SELECT</span>
                    <span>{String(options.length).padStart(2, "0")}</span>
                  </div>
                  <div id={`${id}-listbox`} role="listbox" aria-label={label}>
                    {options.map((option, index) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.value === value}
                        disabled={option.disabled}
                        className={
                          index === activeIndex ? "is-active" : undefined
                        }
                        key={option.value}
                        onPointerMove={() => setActiveIndex(index)}
                        onClick={() => commit(option.value)}
                      >
                        <span
                          className="brand-select__check"
                          aria-hidden="true"
                        />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>,
                document.body,
              )
            : null}
        </>
      ) : null}
    </div>
  );
}
