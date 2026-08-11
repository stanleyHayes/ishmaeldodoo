import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FoundationHero } from "../components/content/foundation-hero";

describe("FoundationHero", () => {
  it("keeps unapproved public content behind a clear foundation state", () => {
    render(<FoundationHero locale="en-GB" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A record built to remain accurate.",
    );
    expect(screen.getByText(/intentionally unpublished/i)).toBeInTheDocument();
  });
});
