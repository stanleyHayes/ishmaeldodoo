import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { operatorSummary, TwoLedgers } from "./two-ledgers";
const items = [
  {
    slug: "a",
    label: "A",
    institution: "Institution A",
    role: "Role A",
    country: "Ghana",
    startDate: new Date("2020-01-01"),
    endDate: new Date("2021-01-01"),
    era: "One",
    themes: [],
    portfolioValue: 2_000_000,
    currency: "USD",
    valueYear: 2020,
    valueType: "managed" as const,
    outcomes: ["Outcome A"],
    sourceRefs: ["source-a"],
  },
  {
    slug: "b",
    label: "B",
    institution: "Institution B",
    role: "Role B",
    country: "Senegal",
    startDate: new Date("2022-01-01"),
    endDate: null,
    era: "Two",
    themes: [],
    portfolioValue: 3_000_000,
    currency: "USD",
    valueYear: 2022,
    valueType: "managed" as const,
    outcomes: ["Outcome B", "Outcome C"],
    sourceRefs: ["source-b"],
  },
  {
    slug: "c",
    label: "C",
    institution: "Institution A",
    role: "Role C",
    country: "Ghana",
    startDate: new Date("2023-01-01"),
    endDate: null,
    era: "Three",
    themes: [],
    portfolioValue: 7_000_000,
    currency: "GHS",
    valueYear: 2023,
    valueType: "raised" as const,
    outcomes: [],
    sourceRefs: ["source-c"],
  },
];
describe("TwoLedgers", () => {
  it("derives operator figures without combining currencies or value types", () => {
    expect(operatorSummary(items)).toEqual({
      institutions: 2,
      countries: 2,
      outcomes: 3,
      portfolios: [
        {
          currency: "USD",
          valueType: "managed",
          total: 5_000_000,
          sourceRefs: ["source-a", "source-b"],
        },
        {
          currency: "GHS",
          valueType: "raised",
          total: 7_000_000,
          sourceRefs: ["source-c"],
        },
      ],
    });
  });
  it("switches projections, persists shared state and updates the URL", () => {
    render(<TwoLedgers items={items} locale="en-GB" />);
    expect(screen.getByRole("heading", { name: "Role A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Results summary" }));
    expect(screen.getByText("Verified outcomes")).toBeInTheDocument();
    expect(localStorage.getItem("amanor-ledger")).toBe("operator");
    expect(new URL(window.location.href).searchParams.get("ledger")).toBe(
      "operator",
    );
    expect(screen.getByRole("link", { name: "source-a" })).toHaveAttribute(
      "href",
      "/record/sources#source-a",
    );
  });
  it("implements roving focus and arrow, Home and End keyboard navigation", () => {
    render(<TwoLedgers items={items} locale="en-GB" />);
    const diplomatic = screen.getByRole("tab", {
      name: "Career history",
    });
    const operator = screen.getByRole("tab", { name: "Results summary" });
    expect(diplomatic).toHaveAttribute("tabindex", "0");
    expect(operator).toHaveAttribute("tabindex", "-1");

    diplomatic.focus();
    fireEvent.keyDown(diplomatic, { key: "ArrowRight" });
    expect(operator).toHaveFocus();
    expect(operator).toHaveAttribute("aria-selected", "true");
    expect(operator).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "operator-ledger-tab",
    );

    fireEvent.keyDown(operator, { key: "Home" });
    expect(diplomatic).toHaveFocus();
    expect(diplomatic).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(diplomatic, { key: "End" });
    expect(operator).toHaveFocus();
  });
  it("scopes printing to the selected ledger and cleans up afterward", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<TwoLedgers items={items} locale="en-GB" />);
    fireEvent.click(screen.getByRole("button", { name: "Print this view" }));
    expect(document.body).toHaveClass("ledger-print");
    expect(print).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("afterprint"));
    expect(document.body).not.toHaveClass("ledger-print");
    print.mockRestore();
  });
});
