import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActiveNavigationLink, routeIsActive } from "./active-navigation-link";

describe("routeIsActive", () => {
  afterEach(cleanup);

  it("matches exact and nested English routes", () => {
    expect(routeIsActive("/record", "/record")).toBe(true);
    expect(routeIsActive("/record/atlas/table", "/record")).toBe(true);
    expect(routeIsActive("/press/contact", "/press")).toBe(true);
    expect(routeIsActive("/signals", "/record")).toBe(false);
  });

  it("keeps French route families isolated", () => {
    expect(routeIsActive("/fr/contact/room", "/fr/contact")).toBe(true);
    expect(routeIsActive("/fr/record", "/record")).toBe(false);
    expect(routeIsActive("/fr/record/", "/fr/record")).toBe(true);
  });

  it("closes the mobile drawer when a destination is activated", () => {
    render(
      <>
        <input id="drawer-toggle" type="checkbox" defaultChecked />
        <ActiveNavigationLink
          href="/record"
          initialPathname="/speaking"
          drawerToggleId="drawer-toggle"
        >
          The Record
        </ActiveNavigationLink>
      </>,
    );

    const toggle = screen.getByRole("checkbox");
    expect(toggle).toBeChecked();

    fireEvent.click(screen.getByRole("link", { name: "The Record" }));

    expect(toggle).not.toBeChecked();
  });
});
