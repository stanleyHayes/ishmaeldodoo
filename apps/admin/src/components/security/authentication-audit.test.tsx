import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthenticationAuditIntegrity,
  listAuthenticationAudit,
} from "../../lib/api/client";
import { AuthenticationAudit } from "./authentication-audit";

vi.mock("../../lib/api/client", () => ({
  listAuthenticationAudit: vi.fn(),
  getAuthenticationAuditIntegrity: vi.fn(),
}));

afterEach(cleanup);

describe("AuthenticationAudit", () => {
  it("renders only redacted events and follows the opaque cursor", async () => {
    vi.mocked(getAuthenticationAuditIntegrity).mockResolvedValue({
      status: "valid",
      checkedEvents: 2,
      headHash: "a".repeat(64),
    });
    vi.mocked(listAuthenticationAudit)
      .mockResolvedValueOnce({
        items: [
          {
            eventId: "event-2",
            type: "role_changed",
            actorId: "security-1",
            subjectId: "editor-2",
            occurredAt: new Date("2026-08-10T12:00:00.000Z"),
            outcome: "success",
            reason: "administrative_change",
          },
          {
            eventId: "event-read",
            type: "privileged_data_read",
            actorId: "editor-2",
            occurredAt: new Date("2026-08-10T11:30:00.000Z"),
            outcome: "success",
            reason: "CmsController.list",
          },
          {
            eventId: "event-key",
            type: "hardware_key_authenticated",
            actorId: "security-1",
            occurredAt: new Date("2026-08-10T11:15:00.000Z"),
            outcome: "success",
          },
        ],
        nextCursor: "opaque-cursor",
      })
      .mockResolvedValueOnce({
        items: [
          {
            eventId: "event-1",
            type: "login_failed",
            subjectId: "editor-2",
            occurredAt: new Date("2026-08-10T11:00:00.000Z"),
            outcome: "failure",
            reason: "invalid_credentials",
          },
        ],
      });
    render(<AuthenticationAudit />);
    expect(await screen.findByText("Roles changed")).toBeInTheDocument();
    expect(screen.getByText("Privileged data read")).toBeInTheDocument();
    expect(screen.getByText("Security key authenticated")).toBeInTheDocument();
    expect(screen.getByText("CmsController.list")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/integrity: valid/iu);
    expect(
      screen.getByRole("list", {
        name: "Security and data-access event history",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByText("security-1")).not.toHaveLength(0);
    expect(
      screen.queryByText(/token|cookie|session-/iu),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load older events" }));
    await waitFor(() =>
      expect(listAuthenticationAudit).toHaveBeenLastCalledWith("opaque-cursor"),
    );
    expect(await screen.findByText("Login failed")).toBeInTheDocument();
  });
});
