import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

describe("public site shell", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("keeps the five-item primary navigation and persistent engagement route", () => {
    render(<SiteHeader />);

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigation.querySelectorAll("a")).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: "Request an engagement" }),
    ).toHaveAttribute("href", "/speaking/request");
  });

  it("offers a server-consistent Night Economy override and carries both statements", () => {
    render(
      <>
        <SiteHeader theme="night" themePreference="night" />
        <SiteFooter />
      </>,
    );

    expect(screen.getByRole("button", { name: "Day mode" })).toHaveAttribute(
      "href",
      "/api/theme?theme=day&return=%2F",
    );
    expect(screen.getByRole("link", { name: "Accra hours" })).toHaveAttribute(
      "href",
      "/api/theme?theme=auto&return=%2F",
    );
    expect(
      screen.getByText(/not an official government website/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This site keeps Accra hours."),
    ).toBeInTheDocument();
  });

  it("renders reciprocal French navigation and utility labels", () => {
    render(<SiteHeader locale="fr-FR" pathname="/fr/record" />);

    expect(screen.getByRole("link", { name: "Le parcours" })).toHaveAttribute(
      "href",
      "/fr/record",
    );
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute(
      "href",
      "/locale/en-GB?returnTo=%2Ffr%2Frecord",
    );
    expect(
      screen.getByRole("button", { name: "Économie nocturne" }),
    ).toHaveAttribute("href", "/api/theme?theme=night&return=%2Ffr%2Frecord");
  });

  it("renders a persistent bilingual Sahel control and its plain statement", () => {
    const { rerender } = render(<SiteHeader />);
    expect(screen.getByRole("button", { name: "Sahel mode" })).toHaveAttribute(
      "href",
      "/api/sahel?enabled=1&return=%2F",
    );
    expect(
      screen.getByText("Built to work on a Sahel connection."),
    ).toBeInTheDocument();

    rerender(<SiteHeader locale="fr-FR" pathname="/fr/record" sahel />);
    expect(
      screen.getByRole("button", { name: "Quitter le mode Sahel" }),
    ).toHaveAttribute("href", "/api/sahel?enabled=0&return=%2Ffr%2Frecord");
  });

  it("removes the persistent engagement call to action from Selah", () => {
    render(<SiteHeader pathname="/selah" />);
    expect(
      screen.queryByRole("link", { name: "Request an engagement" }),
    ).not.toBeInTheDocument();
  });
});
