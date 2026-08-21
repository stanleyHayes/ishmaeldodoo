"use client";

import { useId, useMemo, useState } from "react";

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type Props = Readonly<{
  label: string;
  name?: string;
  mode?: "date" | "datetime";
  value?: string;
  defaultValue?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
}>;

export function AdminTemporalField({
  label,
  name,
  mode = "datetime",
  value,
  defaultValue = "",
  required,
  onValueChange,
}: Props) {
  const id = useId();
  const initial = value ?? defaultValue;
  const [internal, setInternal] = useState(initial);
  const [open, setOpen] = useState(false);
  const current = value ?? internal;
  const [datePart = "", timePart = "09:00"] = current.split("T");
  const [hour = "09", minute = "00"] = timePart.split(":");
  const [month, setMonth] = useState(() => {
    const parsed = datePart ? new Date(`${datePart}T12:00:00`) : new Date();
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  });
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from(
      { length: 42 },
      (_, index) =>
        new Date(month.getFullYear(), month.getMonth(), index - offset + 1),
    );
  }, [month]);

  function update(nextDate: string, nextHour = hour, nextMinute = minute) {
    const next =
      mode === "date" ? nextDate : `${nextDate}T${nextHour}:${nextMinute}`;
    setInternal(next);
    onValueChange?.(next);
  }

  return (
    <div className="admin-temporal">
      <label
        id={`${id}-label`}
        className="admin-field-label"
        htmlFor={`${id}-trigger`}
      >
        {label}
      </label>
      <input type="hidden" name={name} value={current} required={required} />
      <button
        id={`${id}-trigger`}
        type="button"
        className="admin-temporal__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((state) => !state)}
      >
        <span>
          {datePart
            ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                new Date(`${datePart}T12:00:00`),
              )
            : "Choose date"}
        </span>
        <span>
          {mode === "datetime"
            ? datePart
              ? `${hour}:${minute}`
              : "— — : — —"
            : "CAL"}
        </span>
      </button>
      {open ? (
        <div
          className="admin-control-popover admin-calendar"
          role="dialog"
          aria-modal="false"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <div className="admin-control-popover__head">
            <span>AMANOR / OPERATOR CALENDAR</span>
            <button
              type="button"
              aria-label="Close calendar"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="admin-calendar__month">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ←
            </button>
            <strong>
              {new Intl.DateTimeFormat("en-GB", {
                month: "long",
                year: "numeric",
              }).format(month)}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              →
            </button>
          </div>
          <div className="admin-calendar__week" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="admin-calendar__grid">
            {days.map((day) => {
              const candidate = isoDate(day);
              return (
                <button
                  type="button"
                  key={candidate}
                  className={
                    day.getMonth() === month.getMonth()
                      ? undefined
                      : "is-adjacent"
                  }
                  aria-label={candidate}
                  aria-pressed={candidate === datePart}
                  onClick={() => update(candidate)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {mode === "datetime" ? (
            <div className="admin-calendar__time">
              <label>
                Hour
                <input
                  aria-label="Hour"
                  inputMode="numeric"
                  maxLength={2}
                  value={hour}
                  onChange={(event) =>
                    update(
                      datePart,
                      String(
                        Math.min(
                          23,
                          Number(event.target.value.replace(/\D/g, "")) || 0,
                        ),
                      ).padStart(2, "0"),
                      minute,
                    )
                  }
                />
              </label>
              <span>:</span>
              <label>
                Minute
                <input
                  aria-label="Minute"
                  inputMode="numeric"
                  maxLength={2}
                  value={minute}
                  onChange={(event) =>
                    update(
                      datePart,
                      hour,
                      String(
                        Math.min(
                          59,
                          Number(event.target.value.replace(/\D/g, "")) || 0,
                        ),
                      ).padStart(2, "0"),
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={!datePart}
                onClick={() => setOpen(false)}
              >
                Set date
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="admin-calendar__set"
              disabled={!datePart}
              onClick={() => setOpen(false)}
            >
              Set date
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
