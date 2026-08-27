"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function BrandedDateTime({
  name,
  label,
  locale,
}: Readonly<{ name: string; label: string; locale: SupportedLocale }>) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("12");
  const [minute, setMinute] = useState("00");
  const [month, setMonth] = useState(() => {
    const value = new Date();
    return new Date(value.getFullYear(), value.getMonth(), 1);
  });
  const french = locale === "fr-FR";
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from(
      { length: 42 },
      (_, index) =>
        new Date(month.getFullYear(), month.getMonth(), index - offset + 1),
    );
  }, [month]);
  // Normalise the submitted time so it is always a valid, zero-padded HH:MM.
  // Clamping only on blur left an out-of-range or single-digit entry (e.g.
  // "9" or "99") in the hidden field when the form was submitted with the
  // input still focused, producing an unparseable datetime.
  const clamp = (raw: string, max: number) =>
    String(Math.min(max, Number(raw) || 0)).padStart(2, "0");
  const value = date ? `${date}T${clamp(hour, 23)}:${clamp(minute, 59)}` : "";

  return (
    <div className="brand-date-time" ref={root}>
      <label className="brand-field-label" htmlFor={`${id}-trigger`}>
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <button
        id={`${id}-trigger`}
        type="button"
        className="brand-date-time__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          {date
            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(`${date}T12:00:00`),
              )
            : french
              ? "Choisir la date et l’heure"
              : "Choose date and time"}
        </span>
        <span className="brand-date-time__value">
          {date ? `${hour}:${minute}` : "— — : — —"}
        </span>
      </button>
      {open ? (
        <div
          className="brand-popover brand-calendar"
          role="dialog"
          aria-modal="false"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          <div className="brand-popover__head">
            <span>AMANOR / {french ? "ÉCHÉANCE" : "DEADLINE"}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={french ? "Fermer" : "Close"}
            >
              ×
            </button>
          </div>
          <div className="brand-calendar__month">
            <button
              type="button"
              aria-label={french ? "Mois précédent" : "Previous month"}
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ←
            </button>
            <strong>
              {new Intl.DateTimeFormat(locale, {
                month: "long",
                year: "numeric",
              }).format(month)}
            </strong>
            <button
              type="button"
              aria-label={french ? "Mois suivant" : "Next month"}
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              →
            </button>
          </div>
          <div className="brand-calendar__week" aria-hidden="true">
            {(french
              ? ["L", "M", "M", "J", "V", "S", "D"]
              : ["M", "T", "W", "T", "F", "S", "S"]
            ).map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="brand-calendar__grid">
            {days.map((day) => {
              const current = isoDate(day);
              return (
                <button
                  type="button"
                  key={current}
                  className={
                    day.getMonth() !== month.getMonth()
                      ? "is-adjacent"
                      : undefined
                  }
                  aria-pressed={current === date}
                  onClick={() => setDate(current)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="brand-calendar__time">
            <label>
              {french ? "Heure" : "Hour"}
              <input
                inputMode="numeric"
                pattern="[0-2][0-9]"
                maxLength={2}
                value={hour}
                onChange={(event) =>
                  setHour(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                onBlur={() =>
                  setHour(
                    String(Math.min(23, Number(hour) || 0)).padStart(2, "0"),
                  )
                }
              />
            </label>
            <span aria-hidden="true">:</span>
            <label>
              {french ? "Minute" : "Minute"}
              <input
                inputMode="numeric"
                pattern="[0-5][0-9]"
                maxLength={2}
                value={minute}
                onChange={(event) =>
                  setMinute(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                onBlur={() =>
                  setMinute(
                    String(Math.min(59, Number(minute) || 0)).padStart(2, "0"),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={!date}
              onClick={() => setOpen(false)}
            >
              {french ? "Définir" : "Set"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
