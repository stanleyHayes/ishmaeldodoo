import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import { AtlasExplorer } from "./atlas-explorer";
vi.mock("../../lib/analytics-client", () => ({ trackAnalyticsEvent: vi.fn() }));
const leaflet = vi.hoisted(() => {
  let tileError: (() => void) | undefined;
  const map = {
    fitBounds: vi.fn(),
    getZoom: vi.fn(() => 4),
    remove: vi.fn(),
    setView: vi.fn(),
  };
  return {
    map,
    emitTileError: () => tileError?.(),
    module: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({
        on: vi.fn((event: string, callback: () => void) => {
          if (event === "tileerror") tileError = callback;
          return {
            addTo: vi.fn(),
          };
        }),
      })),
      circleMarker: vi.fn(() => ({
        addTo: vi.fn().mockReturnThis(),
        bindTooltip: vi.fn().mockReturnThis(),
        on: vi.fn(),
        setStyle: vi.fn(),
      })),
    },
  };
});
vi.mock("leaflet", () => leaflet.module);
const items = [
  {
    slug: "first",
    label: "First place",
    institution: "Institution A",
    role: "First role",
    country: "Ghana",
    coordinates: [-0.2, 5.6] as [number, number],
    startDate: new Date("2020-01-01"),
    endDate: new Date("2021-01-01"),
    era: "Era A",
    themes: ["finance"],
    outcomes: ["First outcome"],
    sourceRefs: ["source-1"],
  },
  {
    slug: "second",
    label: "Second place",
    institution: "Institution B",
    role: "Second role",
    country: "Senegal",
    coordinates: [-17.4, 14.7] as [number, number],
    startDate: new Date("2022-01-01"),
    endDate: null,
    era: "Era B",
    themes: ["policy"],
    outcomes: ["Second outcome"],
    sourceRefs: ["source-2"],
  },
];
describe("AtlasExplorer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackAnalyticsEvent).mockClear();
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });
  it("opens a directly addressed record and keeps later selection in the URL", () => {
    window.history.replaceState({}, "", "/record/atlas?node=second");
    render(
      <AtlasExplorer
        items={items}
        locale="en-GB"
        tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
        attribution="Example tiles"
        initialNode="second"
        lite
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Second role" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /First place/i }));
    expect(window.location.search).toBe("?node=first");
  });
  it("keeps the map opt-in under Sahel mode while timeline selection updates detail", () => {
    render(
      <AtlasExplorer
        items={items}
        locale="en-GB"
        tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
        attribution="Example tiles"
        lite
      />,
    );
    expect(
      screen.getByText(/map is off in data-saving mode/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load interactive map" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Second place/i }));
    expect(
      screen.getByRole("heading", { name: "Second role" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Second outcome")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "source-2" })).toHaveAttribute(
      "href",
      "/record/sources#source-2",
    );
    expect(trackAnalyticsEvent).toHaveBeenCalledWith({
      name: "atlas_record_opened",
      route: "/record/atlas",
      locale: "en-GB",
      mode: "sahel",
    });
    expect(
      JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls),
    ).not.toContain("second");
  });
  it("starts the optional tour once and records the no-replay choice", () => {
    render(
      <AtlasExplorer
        items={items}
        locale="en-GB"
        tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
        attribution="Example tiles"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Take the 20-second tour" }),
    );
    expect(localStorage.getItem("amanor-atlas-tour-seen")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Skip tour" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(
      screen.queryByRole("button", { name: "Skip tour" }),
    ).not.toBeInTheDocument();
  });
  it("announces tile-provider failure while preserving the timeline", async () => {
    render(
      <AtlasExplorer
        items={items}
        locale="en-GB"
        tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
        attribution="Example tiles"
        lite
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load interactive map" }),
    );
    await waitFor(() => expect(leaflet.module.tileLayer).toHaveBeenCalled());

    leaflet.emitTileError();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Map tiles are temporarily unavailable",
    );
    expect(
      screen.getByRole("button", { name: /Second place/i }),
    ).toBeInTheDocument();
  });
});
