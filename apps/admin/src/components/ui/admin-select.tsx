"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

type OptionRecord = Readonly<{
  value: string;
  label: string;
  disabled: boolean;
}>;

function textFrom(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(textFrom).join("");
}

function collectOptions(children: ReactNode): OptionRecord[] {
  const records: OptionRecord[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        value?: string | number;
        disabled?: boolean;
        children?: ReactNode;
      }>(child)
    )
      return;
    if (child.type === "option") {
      const label = textFrom(child.props.children).trim();
      records.push({
        value: String(child.props.value ?? label),
        label,
        disabled: Boolean(child.props.disabled),
      });
      return;
    }
    records.push(...collectOptions(child.props.children));
  });
  return records;
}

type AdminSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "multiple" | "size"
> &
  Readonly<{
    label: string;
    children: ReactNode;
  }>;

export function AdminSelect({
  label,
  children,
  className,
  value,
  defaultValue,
  onChange,
  ...props
}: AdminSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const options = collectOptions(children);
  const enhanced = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const initial = String(value ?? defaultValue ?? options[0]?.value ?? "");
  const [internalValue, setInternalValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<CSSProperties>();
  const selectedValue = value === undefined ? internalValue : String(value);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function openMenu() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const mobile =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 767px)").matches;
      setPlacement(
        mobile
          ? { inset: "auto 0 0", width: "100%" }
          : {
              top: rect.bottom + 8,
              left: Math.max(
                16,
                Math.min(
                  rect.left,
                  window.innerWidth - Math.max(rect.width, 320) - 16,
                ),
              ),
              width: Math.max(rect.width, 320),
            },
      );
    }
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function commit(next: string) {
    setInternalValue(next);
    if (native.current) {
      native.current.value = next;
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function move(direction: 1 | -1) {
    let next = activeIndex;
    do next = (next + direction + options.length) % options.length;
    while (options[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  }

  return (
    <div
      className={["admin-select", className].filter(Boolean).join(" ")}
      ref={root}
      onReset={() => {
        setInternalValue(String(defaultValue ?? options[0]?.value ?? ""));
        setOpen(false);
      }}
    >
      <label
        id={`${id}-label`}
        className="admin-field-label"
        htmlFor={`${id}-native`}
      >
        {label}
      </label>
      <select
        {...props}
        ref={native}
        id={`${id}-native`}
        className={
          enhanced ? "admin-select__native is-enhanced" : "admin-select__native"
        }
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(event) => {
          setInternalValue(event.target.value);
          onChange?.(event);
        }}
        aria-hidden={enhanced || undefined}
        tabIndex={enhanced ? -1 : undefined}
      >
        {children}
      </select>
      {enhanced ? (
        <>
          <button
            ref={trigger}
            type="button"
            className="admin-select__trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-label={`${label}: ${selected?.label ?? "No selection"}`}
            disabled={props.disabled}
            onClick={() => (open ? setOpen(false) : openMenu())}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!open) openMenu();
                else move(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!open) openMenu();
                else if (options[activeIndex] && !options[activeIndex].disabled)
                  commit(options[activeIndex].value);
              } else if (event.key === "Escape" && open) {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                if (!open) openMenu();
                setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
              }
            }}
          >
            <span>{selected?.label ?? "No selection"}</span>
            <span className="admin-select__glyph" aria-hidden="true" />
          </button>
          {open
            ? createPortal(
                <div
                  ref={popover}
                  className="admin-control-popover admin-select__popover"
                  style={placement}
                >
                  <div className="admin-control-popover__head">
                    <span>AMANOR / OPERATOR SELECT</span>
                    <span>{String(options.length).padStart(2, "0")}</span>
                  </div>
                  <div id={`${id}-listbox`} role="listbox" aria-label={label}>
                    {options.map((option, index) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.value === selectedValue}
                        disabled={option.disabled}
                        className={
                          index === activeIndex ? "is-active" : undefined
                        }
                        key={`${option.value}-${index}`}
                        onPointerMove={() => setActiveIndex(index)}
                        onClick={() => commit(option.value)}
                      >
                        <span
                          className="admin-select__mark"
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
