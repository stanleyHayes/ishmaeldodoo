import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  audienceCookieName,
  audienceStorageName,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import { AudienceDoors } from "./audience-doors";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const destinations: Readonly<Record<AudienceKey, string>> = {
  government: "home-record-heading",
  investor: "atlas-preview-heading",
  media: "current-position-heading",
  youth: "home-record-heading",
  philanthropy: "home-signal-heading",
};

describe("AudienceDoors", () => {
  beforeEach(() => {
    push.mockClear();
    window.localStorage.clear();
    document.cookie = `${audienceCookieName}=; Max-Age=0; Path=/`;
    window.history.replaceState(null, "", "/");
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders the server selection without mutating visitor preference stores", () => {
    render(
      <AudienceDoors
        locale="en-GB"
        selected="investor"
        destinations={destinations}
      />,
    );
    expect(
      screen.getAllByText(/^(Show this information|Now showing)$/u),
    ).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: /investment opportunities/i }),
    ).toHaveAttribute("aria-current", "true");
    expect(window.localStorage.getItem(audienceStorageName)).toBeNull();
    expect(document.cookie).not.toContain(`${audienceCookieName}=`);
  });

  it("confirms the active view and marks the chosen door", () => {
    const { rerender } = render(
      <AudienceDoors
        locale="en-GB"
        selected={null}
        destinations={destinations}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "The general view is showing.",
    );
    expect(screen.queryByText("Now showing")).not.toBeInTheDocument();

    rerender(
      <AudienceDoors
        locale="en-GB"
        selected="investor"
        destinations={destinations}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /Now showing: .*investment opportunities/iu,
    );
    expect(screen.getByText("Now showing")).toBeInTheDocument();
  });

  it("persists an explicit visitor selection in both stores", () => {
    render(
      <AudienceDoors
        locale="en-GB"
        selected={null}
        destinations={destinations}
      />,
    );
    fireEvent.click(
      screen.getByRole("link", { name: /investment opportunities/i }),
    );
    expect(window.localStorage.getItem(audienceStorageName)).toBe("investor");
    expect(document.cookie).toContain(`${audienceCookieName}=investor`);
  });

  it("routes a selection to the block that choice promotes", () => {
    const { rerender } = render(
      <AudienceDoors
        locale="en-GB"
        selected={null}
        destinations={destinations}
      />,
    );
    const link = screen.getByRole("link", {
      name: /investment opportunities/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "/api/audience?door=investor&return=%2F%3Fdoor%3Dinvestor%23atlas-preview-heading",
    );

    const activated = fireEvent.click(link);
    expect(activated).toBe(false);
    expect(push).toHaveBeenCalledWith("/?door=investor#atlas-preview-heading", {
      scroll: false,
    });

    const promoted = document.createElement("h2");
    promoted.id = "atlas-preview-heading";
    document.body.append(promoted);
    rerender(
      <AudienceDoors
        locale="en-GB"
        selected="investor"
        destinations={destinations}
      />,
    );
    expect(promoted.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("leaves modified clicks to the browser so the plain link still works", () => {
    render(
      <AudienceDoors
        locale="en-GB"
        selected={null}
        destinations={destinations}
      />,
    );
    const activated = fireEvent.click(
      screen.getByRole("link", { name: /investment opportunities/i }),
      { metaKey: true },
    );
    expect(activated).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("offers an always-visible reset and clears both stores", () => {
    render(
      <AudienceDoors
        locale="en-GB"
        selected="government"
        destinations={destinations}
        resetDestination="home-record-heading"
      />,
    );
    fireEvent.click(
      screen.getByRole("link", { name: "Show the general view" }),
    );
    expect(window.localStorage.getItem(audienceStorageName)).toBeNull();
    expect(document.cookie).not.toContain(`${audienceCookieName}=`);
    expect(push).toHaveBeenCalledWith("/?audience=reset#home-record-heading", {
      scroll: false,
    });
  });

  it("converges a destination selection or reset after hydration", () => {
    window.history.replaceState(null, "", "/?door=investor");
    const first = render(
      <AudienceDoors
        locale="en-GB"
        selected="investor"
        destinations={destinations}
      />,
    );
    expect(window.localStorage.getItem(audienceStorageName)).toBe("investor");
    first.unmount();

    window.history.replaceState(null, "", "/?audience=reset");
    render(
      <AudienceDoors
        locale="en-GB"
        selected={null}
        destinations={destinations}
      />,
    );
    expect(window.localStorage.getItem(audienceStorageName)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("keeps no-JavaScript-compatible query links in French", () => {
    render(
      <AudienceDoors
        locale="fr-FR"
        selected={null}
        destinations={destinations}
      />,
    );
    expect(
      screen.getByRole("link", { name: /possibilités d’investissement/i }),
    ).toHaveAttribute(
      "href",
      "/api/audience?door=investor&return=%2Ffr%3Fdoor%3Dinvestor%23atlas-preview-heading",
    );
  });
});
