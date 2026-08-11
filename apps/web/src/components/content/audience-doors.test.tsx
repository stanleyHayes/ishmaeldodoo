import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  audienceCookieName,
  audienceStorageName,
} from "../../lib/audience/adaptive-dossier";
import { AudienceDoors } from "./audience-doors";

describe("AudienceDoors", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${audienceCookieName}=; Max-Age=0; Path=/`;
  });

  it("renders the server selection without mutating visitor preference stores", () => {
    render(<AudienceDoors locale="en-GB" selected="investor" />);
    expect(screen.getAllByRole("link", { name: /choose/i })).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: /de-risked pipeline/i }),
    ).toHaveAttribute("aria-current", "true");
    expect(window.localStorage.getItem(audienceStorageName)).toBeNull();
    expect(document.cookie).not.toContain(`${audienceCookieName}=`);
  });

  it("persists an explicit visitor selection in both stores", () => {
    render(<AudienceDoors locale="en-GB" selected={null} />);
    fireEvent.click(screen.getByRole("link", { name: /de-risked pipeline/i }));
    expect(window.localStorage.getItem(audienceStorageName)).toBe("investor");
    expect(document.cookie).toContain(`${audienceCookieName}=investor`);
  });

  it("offers an always-visible reset and clears both stores", () => {
    render(<AudienceDoors locale="en-GB" selected="government" />);
    fireEvent.click(screen.getByRole("link", { name: "Reset view" }));
    expect(window.localStorage.getItem(audienceStorageName)).toBeNull();
    expect(document.cookie).not.toContain(`${audienceCookieName}=`);
  });

  it("converges a destination selection or reset after hydration", () => {
    window.history.replaceState(null, "", "/?door=investor");
    const first = render(<AudienceDoors locale="en-GB" selected="investor" />);
    expect(window.localStorage.getItem(audienceStorageName)).toBe("investor");
    first.unmount();

    window.history.replaceState(null, "", "/?audience=reset");
    render(<AudienceDoors locale="en-GB" selected={null} />);
    expect(window.localStorage.getItem(audienceStorageName)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("keeps no-JavaScript-compatible query links in French", () => {
    render(<AudienceDoors locale="fr-FR" selected={null} />);
    expect(
      screen.getByRole("link", { name: /projets structurés/i }),
    ).toHaveAttribute(
      "href",
      "/api/audience?door=investor&return=%2Ffr%3Fdoor%3Dinvestor",
    );
  });
});
