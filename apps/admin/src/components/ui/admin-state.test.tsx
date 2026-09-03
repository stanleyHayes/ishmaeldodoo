import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminEmptyState,
  AdminNotice,
  AdminSkeleton,
  BusyLabel,
} from "./admin-state";

describe("admin state primitives", () => {
  it("composes an illustrated empty state with useful copy and action", () => {
    const { container } = render(
      <AdminEmptyState
        kind="media"
        title="The governed library is ready"
        description="Register the first approved asset."
        action={<button type="button">Add asset</button>}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The governed library is ready" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Register the first approved asset."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add asset" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".admin-empty-state__emblem"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("announces structural loading without exposing decorative skeleton bars", () => {
    const { container } = render(
      <AdminSkeleton variant="media" label="Loading governed media" />,
    );

    expect(
      screen.getByRole("status", { name: "Loading governed media" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".admin-skeleton__item")).toHaveLength(3);
  });

  it("sizes an appended skeleton to the rows the caller expects", () => {
    const { container } = render(
      <AdminSkeleton
        variant="rows"
        label="Loading older security events"
        count={5}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Loading older security events" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".admin-skeleton__item")).toHaveLength(5);
  });

  it("keeps a busy control readable instead of replacing it with a spinner", () => {
    const { container } = render(<BusyLabel label="Publishing" />);

    expect(
      screen.getByRole("status", { name: "Publishing" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(
      container.querySelector(".admin-busy-label__progress"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("pairs a plain-language error with context and a recovery action", () => {
    render(
      <AdminNotice
        tone="error"
        title="We couldn't open the library"
        description="Check your connection and try again."
        action={<button type="button">Try again</button>}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("We couldn't open the library");
    expect(alert).toHaveTextContent("Check your connection and try again.");
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
