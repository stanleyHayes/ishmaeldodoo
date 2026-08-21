/**
 * The AMANOR mark: an apex "A" (authority, ascent) grounded on an extending
 * gold baseline — the sourced public record the platform is built on. The apex
 * inherits currentColor so it adapts to day/night; the record line is gold.
 */
export function AmanorMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.6 18.4 L12 4 L19.4 18.4"
        stroke="currentColor"
        strokeWidth="2.05"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M8.5 13.2 H15.5"
        stroke="currentColor"
        strokeWidth="2.05"
        strokeLinecap="round"
      />
      <path
        d="M3 21.4 H21"
        stroke="var(--gold, #b08d3f)"
        strokeWidth="2.05"
        strokeLinecap="round"
      />
    </svg>
  );
}
