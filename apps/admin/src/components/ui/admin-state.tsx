import type { ReactNode } from "react";

type EmptyStateKind =
  "media" | "history" | "audit" | "content" | "queue" | "work";
type NoticeTone = "error" | "success" | "information";

export function AdminNotice({
  tone,
  title,
  description,
  action,
}: Readonly<{
  tone: NoticeTone;
  title: string;
  description?: string;
  action?: ReactNode;
}>) {
  return (
    <div
      className="admin-notice"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="admin-notice__icon" aria-hidden="true">
        {tone === "error" ? "!" : tone === "success" ? "✓" : "i"}
      </span>
      <div className="admin-notice__copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="admin-notice__action">{action}</div> : null}
    </div>
  );
}

/**
 * A control that is already doing something, not a region waiting for content.
 * A button must keep a readable label, so this states the action and carries a
 * thin indeterminate rule rather than a spinner. Regions use `AdminSkeleton`.
 */
export function BusyLabel({ label }: Readonly<{ label: string }>) {
  return (
    <span className="admin-busy-label" role="status" aria-label={label}>
      <span aria-hidden="true">{label}</span>
      <span className="admin-busy-label__progress" aria-hidden="true" />
    </span>
  );
}

export function AdminEmptyState({
  kind,
  title,
  description,
  action,
}: Readonly<{
  kind: EmptyStateKind;
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <div className="admin-empty-state" data-kind={kind}>
      <span className="admin-empty-state__corner" aria-hidden="true" />
      <div className="admin-empty-state__emblem" aria-hidden="true">
        <svg viewBox="0 0 80 80">
          <circle className="admin-empty-state__orbit" cx="40" cy="40" r="31" />
          <path className="admin-empty-state__mark" d={emptyMark[kind]} />
          <circle className="admin-empty-state__signal" cx="64" cy="24" r="3" />
        </svg>
      </div>
      <div className="admin-empty-state__copy">
        <p className="section-context">Workspace clear</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? (
        <div className="admin-empty-state__action">{action}</div>
      ) : null}
    </div>
  );
}

const emptyMark: Record<EmptyStateKind, string> = {
  media: "M25 29h30v24H25z M31 29l4-7h10l4 7 M31 46l7-7 6 6 4-4 7 7",
  history: "M40 23a17 17 0 1 1-15 9 M25 23v9h9 M40 30v11l8 5",
  audit: "M28 24h24v32H28z M34 33h12 M34 40h12 M34 47h8 M46 50l4 4 7-8",
  content: "M27 22h20l7 7v29H27z M47 22v8h7 M33 38h15 M33 45h15 M33 52h9",
  queue: "M24 28h32v28H24z M30 22h20v6 M31 38h18 M31 46h12",
  work: "M24 31h32v24H24z M30 31l4-7h12l4 7 M33 43l5 5 10-12",
};

type SkeletonVariant = "media" | "content" | "rows" | "panel";

const skeletonCounts: Readonly<Record<SkeletonVariant, number>> = {
  media: 3,
  content: 4,
  rows: 3,
  panel: 1,
};

/**
 * A region waiting for content shows the shape of that content, never a word
 * or a spinner: the layout does not jump when the data lands, and a slow
 * response reads as "arriving" rather than "broken".
 */
export function AdminSkeleton({
  variant,
  label,
  count,
}: Readonly<{
  variant: SkeletonVariant;
  label: string;
  /** Match the number of rows the caller expects to append. */
  count?: number;
}>) {
  const items = count ?? skeletonCounts[variant];
  return (
    <div
      className={`admin-skeleton admin-skeleton--${variant}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: items }, (_, index) => (
        <div className="admin-skeleton__item" key={index} aria-hidden="true">
          {variant === "media" ? (
            <span className="admin-skeleton__image" />
          ) : null}
          <span className="admin-skeleton__line admin-skeleton__line--strong" />
          <span className="admin-skeleton__line" />
          {variant === "rows" ? null : (
            <span className="admin-skeleton__line admin-skeleton__line--short" />
          )}
          {variant === "panel" ? (
            <>
              <span className="admin-skeleton__line" />
              <span className="admin-skeleton__line admin-skeleton__line--short" />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
