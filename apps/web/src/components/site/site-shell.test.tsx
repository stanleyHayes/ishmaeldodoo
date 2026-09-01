import { cleanup, render, screen, within } from "@testing-library/react";
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
    const { container } = render(
      <>
        <SiteHeader theme="night" themePreference="night" />
        <SiteFooter displayName="Dr Ishmael Nii Amanor Dodoo" />
      </>,
    );

    const utilityBar = container.querySelector(".utility-bar");
    expect(utilityBar).not.toBeNull();
    expect(
      within(utilityBar as HTMLElement).getByRole("button", {
        name: "Day mode",
      }),
    ).toHaveAttribute("href", "/api/theme?theme=day&return=%2F");
    expect(
      within(utilityBar as HTMLElement).getByRole("link", {
        name: "Accra hours",
      }),
    ).toHaveAttribute("href", "/api/theme?theme=auto&return=%2F");
    expect(
      screen.getByText(/not an official publication/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This site keeps Accra hours."),
    ).toBeInTheDocument();
  });

  it("renders canonical identity in the full public-office disclosure", () => {
    render(<SiteFooter displayName="Dr Ishmael Nii Amanor Dodoo" />);

    expect(
      screen.getByText(/personal website of Dr Ishmael Nii Amanor Dodoo/i),
    ).toHaveTextContent(/Office of the President, or the Government of Ghana/i);
    expect(screen.getByRole("link", { name: "Sources" })).toHaveAttribute(
      "href",
      "/record/sources",
    );
    expect(
      screen.getByRole("link", { name: /continue the conversation/i }),
    ).toHaveAttribute("href", "/contact");
    expect(screen.getByText("END OF RECORD")).toBeInTheDocument();
  });

  it("marks nested primary routes as the current section", () => {
    render(<SiteHeader pathname="/record/atlas/table" />);

    expect(screen.getByRole("link", { name: "The Record" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Press" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders reciprocal French navigation and utility labels", () => {
    const { container } = render(
      <SiteHeader locale="fr-FR" pathname="/fr/record" />,
    );

    expect(screen.getByRole("link", { name: "Le parcours" })).toHaveAttribute(
      "href",
      "/fr/record",
    );
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute(
      "href",
      "/locale/en-GB?returnTo=%2Ffr%2Frecord",
    );
    const utilityBar = container.querySelector(".utility-bar");
    expect(utilityBar).not.toBeNull();
    expect(
      within(utilityBar as HTMLElement).getByRole("button", {
        name: "Économie nocturne",
      }),
    ).toHaveAttribute("href", "/api/theme?theme=night&return=%2Ffr%2Frecord");
  });

  it("renders a persistent bilingual Lite control and its plain statement", () => {
    const { container, rerender } = render(<SiteHeader />);
    const utilityBar = container.querySelector(".utility-bar");
    expect(utilityBar).not.toBeNull();
    expect(
      within(utilityBar as HTMLElement).getByRole("button", {
        name: "Lite mode",
      }),
    ).toHaveAttribute("href", "/api/lite?enabled=1&return=%2F");
    expect(
      screen.getAllByText("Built to work on a Lite connection."),
    ).toHaveLength(2);

    rerender(<SiteHeader locale="fr-FR" pathname="/fr/record" lite />);
    expect(
      screen.getByRole("button", { name: "Quitter le mode Lite" }),
    ).toHaveAttribute("href", "/api/lite?enabled=0&return=%2Ffr%2Frecord");
  });

  it("keeps mobile utilities inside the bilingual navigation drawer", () => {
    const { container } = render(
      <SiteHeader locale="fr-FR" pathname="/fr/record" />,
    );
    const utilities = container.querySelector(".nav-drawer__utilities");
    expect(utilities).not.toBeNull();
    const drawer = within(utilities as HTMLElement);

    expect(drawer.getByRole("link", { name: "English" })).toHaveAttribute(
      "href",
      "/locale/en-GB?returnTo=%2Ffr%2Frecord",
    );
    expect(drawer.getByRole("link", { name: "Français" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(drawer.getByRole("link", { name: "Recherche" })).toHaveAttribute(
      "href",
      "/fr/search",
    );
    expect(drawer.getByRole("button", { name: "Mode Lite" })).toHaveAttribute(
      "href",
      "/api/lite?enabled=1&return=%2Ffr%2Frecord",
    );
  });

  it("removes the persistent engagement call to action from Selah", () => {
    render(<SiteHeader pathname="/selah" />);
    expect(
      screen.queryByRole("link", { name: "Request an engagement" }),
    ).not.toBeInTheDocument();
  });
});
