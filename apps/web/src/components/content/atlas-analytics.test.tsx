import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import { AtlasFilterAnalytics } from "./atlas-analytics";

vi.mock("../../lib/analytics-client", () => ({ trackAnalyticsEvent: vi.fn() }));

describe("AtlasFilterAnalytics", () => {
  beforeEach(() => vi.mocked(trackAnalyticsEvent).mockClear());

  it("records only the filtered route context without filter values", async () => {
    render(
      <AtlasFilterAnalytics
        locale="fr-FR"
        route="/fr/record/atlas/table"
        filtered
        lite
      />,
    );
    await waitFor(() =>
      expect(trackAnalyticsEvent).toHaveBeenCalledWith({
        name: "atlas_filter_applied",
        route: "/fr/record/atlas/table",
        locale: "fr-FR",
        mode: "lite",
      }),
    );
    expect(
      JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls),
    ).not.toMatch(/theme|institution|currency|scale/u);
  });

  it("stays silent when no Atlas filter is active", () => {
    render(
      <AtlasFilterAnalytics
        locale="en-GB"
        route="/record/atlas"
        filtered={false}
      />,
    );
    expect(trackAnalyticsEvent).not.toHaveBeenCalled();
  });
});
