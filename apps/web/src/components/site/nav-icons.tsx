import type { ReactNode } from "react";

/**
 * Line icons for the mobile navigation drawer. Each is a 24×24 stroke glyph
 * that inherits currentColor, so it reads on the drawer's dark ground.
 */
const svg = (children: ReactNode): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const navIcons = {
  home: svg(
    <>
      <path d="m4 10 8-6.5 8 6.5" />
      <path d="M6.5 9v11h11V9M10 20v-6h4v6" />
    </>,
  ),
  record: svg(
    <>
      <path d="M6.5 3.5h7L18 8v11.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M13 3.5V8h4.5" />
      <path d="M8.5 12.5h6M8.5 16h4" />
    </>,
  ),
  speaking: svg(
    <>
      <rect x="9.25" y="3" width="5.5" height="10" rx="2.75" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3.5M9 20.5h6" />
    </>,
  ),
  signals: svg(
    <>
      <circle cx="12" cy="12" r="1.75" />
      <path d="M8.9 8.9a4.4 4.4 0 0 0 0 6.2M15.1 8.9a4.4 4.4 0 0 1 0 6.2" />
      <path d="M6.4 6.4a8 8 0 0 0 0 11.2M17.6 6.4a8 8 0 0 1 0 11.2" />
    </>,
  ),
  press: svg(
    <>
      <path d="M4 5.5h12.5v13H5.5a1.5 1.5 0 0 1-1.5-1.5V5.5Z" />
      <path d="M16.5 9H20v7.5a2 2 0 0 1-2 2" />
      <path d="M7 9h6.5M7 12.5h6.5M7 16h4" />
    </>,
  ),
  contact: svg(
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </>,
  ),
  engagement: svg(
    <>
      <path d="M21 3.5 10.5 14M21 3.5l-6.5 17-4-6.5-6.5-4 17-6.5Z" />
    </>,
  ),
  close: svg(<path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />),
} as const;

export type NavIconKey = keyof typeof navIcons;
