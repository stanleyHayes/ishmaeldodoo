import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminEmptyState, AdminSkeleton, LoadingDots } from "./admin-state";

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

  it("keeps animated button progress accessible by its operation", () => {
    render(<LoadingDots label="Publishing" />);

    expect(
      screen.getByRole("status", { name: "Publishing" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".admin-loading-dots i")).toHaveLength(3);
  });
});
