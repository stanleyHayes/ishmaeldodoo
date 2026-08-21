import type { ReactNode } from "react";

type EmptyStateKind = "media" | "history" | "audit" | "content";

export function LoadingDots({ label }: Readonly<{ label: string }>) {
  return (
    <span className="admin-loading-label" role="status" aria-label={label}>
      <span aria-hidden="true">{label}</span>
      <span className="admin-loading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
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
};

export function AdminSkeleton({
  variant,
  label,
}: Readonly<{
  variant: "media" | "content";
  label: string;
}>) {
  const count = variant === "media" ? 3 : 4;
  return (
    <div
      className={`admin-skeleton admin-skeleton--${variant}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="admin-skeleton__item" key={index} aria-hidden="true">
          {variant === "media" ? (
            <span className="admin-skeleton__image" />
          ) : null}
          <span className="admin-skeleton__line admin-skeleton__line--strong" />
          <span className="admin-skeleton__line" />
          <span className="admin-skeleton__line admin-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}
