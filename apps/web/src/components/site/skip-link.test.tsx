import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkipLink } from "./skip-link";

describe("SkipLink", () => {
  it("moves focus to main content and preserves the fragment", () => {
    const scrollIntoView = vi.fn();
    render(
      <>
        <SkipLink label="Skip to content" />
        <main
          id="main-content"
          tabIndex={-1}
          ref={(node) => {
            if (node) node.scrollIntoView = scrollIntoView;
          }}
        >
          Content
        </main>
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));

    expect(document.querySelector("main")).toHaveFocus();
    expect(window.location.hash).toBe("#main-content");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });
});
