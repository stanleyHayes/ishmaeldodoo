import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api/client";
import AdminPage from "./page";

const apiMocks = vi.hoisted(() => ({
  beginLogin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  listAdministrators: vi.fn(),
  listAuthenticationAudit: vi.fn(),
  getAuthenticationAuditIntegrity: vi.fn(),
  listContentVersions: vi.fn(),
  listContentDocuments: vi.fn(),
  createContentDraft: vi.fn(),
  transitionContentVersion: vi.fn(),
  publishContentVersion: vi.fn(),
  listContentAudit: vi.fn(),
  exportContentAudit: vi.fn(),
  getContentAuditIntegrity: vi.fn(),
  getSourceAuditReport: vi.fn(),
  rollbackContentVersion: vi.fn(),
  unpublishContent: vi.fn(),
  listProtocolDeskQueue: vi.fn(),
  getProtocolDeskOperations: vi.fn(),
  checkProtocolDeskAvailability: vi.fn(),
  getProtocolDeskRequest: vi.fn(),
  assignProtocolDeskRequest: vi.fn(),
  addProtocolDeskNote: vi.fn(),
  transitionProtocolDeskRequest: vi.fn(),
  clearProtocolDeskFlag: vi.fn(),
  retryProtocolDeskCalendarSync: vi.fn(),
  retryPrincipalDecisionDelivery: vi.fn(),
  generateProtocolNote: vi.fn(),
  configureProtocolNote: vi.fn(),
}));

vi.mock("../lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/client")>();
  return {
    ...actual,
    beginLogin: apiMocks.beginLogin,
    completeLogin: apiMocks.login,
    logout: apiMocks.logout,
    listSessions: apiMocks.listSessions,
    revokeSession: apiMocks.revokeSession,
    listAdministrators: apiMocks.listAdministrators,
    listAuthenticationAudit: apiMocks.listAuthenticationAudit,
    getAuthenticationAuditIntegrity: apiMocks.getAuthenticationAuditIntegrity,
    listContentVersions: apiMocks.listContentVersions,
    listContentDocuments: apiMocks.listContentDocuments,
    createContentDraft: apiMocks.createContentDraft,
    transitionContentVersion: apiMocks.transitionContentVersion,
    publishContentVersion: apiMocks.publishContentVersion,
    listContentAudit: apiMocks.listContentAudit,
    exportContentAudit: apiMocks.exportContentAudit,
    getContentAuditIntegrity: apiMocks.getContentAuditIntegrity,
    getSourceAuditReport: apiMocks.getSourceAuditReport,
    rollbackContentVersion: apiMocks.rollbackContentVersion,
    unpublishContent: apiMocks.unpublishContent,
    listProtocolDeskQueue: apiMocks.listProtocolDeskQueue,
    getProtocolDeskOperations: apiMocks.getProtocolDeskOperations,
    checkProtocolDeskAvailability: apiMocks.checkProtocolDeskAvailability,
    getProtocolDeskRequest: apiMocks.getProtocolDeskRequest,
    assignProtocolDeskRequest: apiMocks.assignProtocolDeskRequest,
    addProtocolDeskNote: apiMocks.addProtocolDeskNote,
    transitionProtocolDeskRequest: apiMocks.transitionProtocolDeskRequest,
    clearProtocolDeskFlag: apiMocks.clearProtocolDeskFlag,
    retryProtocolDeskCalendarSync: apiMocks.retryProtocolDeskCalendarSync,
    retryPrincipalDecisionDelivery: apiMocks.retryPrincipalDecisionDelivery,
    generateProtocolNote: apiMocks.generateProtocolNote,
    configureProtocolNote: apiMocks.configureProtocolNote,
  };
});

function completeLoginForm() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "editor@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a-long-development-passphrase" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue securely" }));
  void screen.findByLabelText("Digit 1 of 6").then((input) => {
    fireEvent.paste(input, {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to console" }),
    );
  });
}

describe("admin application", () => {
  beforeEach(() => {
    apiMocks.beginLogin.mockResolvedValue({
      state: "mfa_required",
      challenge: "a".repeat(64),
      expiresIn: 300,
    });
    apiMocks.listAdministrators.mockResolvedValue([]);
    apiMocks.listAuthenticationAudit.mockResolvedValue({ items: [] });
    apiMocks.getAuthenticationAuditIntegrity.mockResolvedValue({
      status: "valid",
      checkedEvents: 0,
    });
    apiMocks.getContentAuditIntegrity.mockResolvedValue({
      status: "valid",
      checkedEvents: 0,
    });
    apiMocks.getSourceAuditReport.mockResolvedValue({
      generatedAt: new Date("2026-08-10T00:00:00Z"),
      totals: {
        publications: 3,
        sourceEntries: 2,
        claimReferences: 2,
        missingReferences: 1,
        unusedSources: 1,
        duplicateReferences: 0,
      },
      sources: [],
      claims: [],
    });
    apiMocks.getProtocolDeskOperations.mockResolvedValue({
      generatedAt: new Date(),
      requestsByState: { screened: 1 },
      openEscalations: [],
      overdueInitialResponses: 0,
      failedCorrespondence: 0,
      pendingCorrespondence: 2,
      failedCalendarSync: 1,
      pendingCalendarSync: 2,
      failedPrincipalDecisionDeliveries: 1,
      pendingPrincipalDecisionDeliveries: 3,
      oldestPendingSeconds: 0,
    });
    apiMocks.checkProtocolDeskAvailability.mockResolvedValue({
      available: false,
      checkedAt: new Date(),
      conflicts: [
        {
          type: "blackout",
          reference: "travel-1",
          startsAt: new Date("2026-12-01T09:00:00Z"),
          endsAt: new Date("2026-12-01T11:00:00Z"),
          reason: "travel",
        },
      ],
    });
  });

  afterEach(() => {
    apiMocks.beginLogin.mockReset();
    cleanup();
    apiMocks.login.mockReset();
    apiMocks.logout.mockReset();
    apiMocks.listSessions.mockReset();
    apiMocks.revokeSession.mockReset();
    apiMocks.listAdministrators.mockReset();
    apiMocks.listAuthenticationAudit.mockReset();
    apiMocks.getAuthenticationAuditIntegrity.mockReset();
    apiMocks.listContentVersions.mockReset();
    apiMocks.listContentDocuments.mockReset();
    apiMocks.createContentDraft.mockReset();
    apiMocks.transitionContentVersion.mockReset();
    apiMocks.publishContentVersion.mockReset();
    apiMocks.listContentAudit.mockReset();
    apiMocks.exportContentAudit.mockReset();
    apiMocks.getContentAuditIntegrity.mockReset();
    apiMocks.getSourceAuditReport.mockReset();
    apiMocks.rollbackContentVersion.mockReset();
    apiMocks.unpublishContent.mockReset();
    apiMocks.listProtocolDeskQueue.mockReset();
    apiMocks.getProtocolDeskOperations.mockReset();
    apiMocks.checkProtocolDeskAvailability.mockReset();
    apiMocks.getProtocolDeskRequest.mockReset();
    apiMocks.assignProtocolDeskRequest.mockReset();
    apiMocks.addProtocolDeskNote.mockReset();
    apiMocks.transitionProtocolDeskRequest.mockReset();
    apiMocks.clearProtocolDeskFlag.mockReset();
    apiMocks.retryProtocolDeskCalendarSync.mockReset();
    apiMocks.retryPrincipalDecisionDelivery.mockReset();
    apiMocks.generateProtocolNote.mockReset();
    apiMocks.configureProtocolNote.mockReset();
  });

  it("starts at the protected sign-in surface", () => {
    render(<AdminPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Administration" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/protected editorial and operations access/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Administration sections" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Digit 1 of 6")).not.toBeInTheDocument();
  });

  it("reveals MFA only after the credentials step succeeds", async () => {
    render(<AdminPage />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "editor@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-development-passphrase" },
    });
    expect(screen.queryByLabelText("Digit 1 of 6")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue securely" }));

    expect(await screen.findByLabelText("Digit 1 of 6")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(apiMocks.beginLogin).toHaveBeenCalledWith(
      "editor@example.test",
      "a-long-development-passphrase",
    );
  });

  it("uses the API session roles to limit operator navigation", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    render(<AdminPage />);
    completeLoginForm();

    await waitFor(() =>
      expect(
        screen.getByRole("navigation", { name: "Administration sections" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Content/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Media/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Protocol Desk/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Security/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.queryByText("Operator")).not.toBeInTheDocument();
    expect(screen.queryByText("editor-1")).not.toBeInTheDocument();

    const shell = screen.getByRole("main");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("downloads the complete source and claim audit for an editorial reviewer", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "reviewer-1", roles: ["reviewer"] },
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:source-audit");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Download source audit" }),
    );
    expect(
      await screen.findByText(
        /2 sources · 2 claim references · 1 missing · 1 unused/,
      ),
    ).toBeVisible();
    expect(apiMocks.getSourceAuditReport).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it("limits a Press Officer to overview and governed media", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "press-1", roles: ["press_officer"] },
    });
    render(<AdminPage />);
    completeLoginForm();

    await screen.findByRole("navigation", {
      name: "Administration sections",
    });
    expect(screen.getByRole("button", { name: /Media/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Content/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Protocol Desk/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Security/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Press officer")).toBeInTheDocument();
  });

  it("returns to sign-in after clearing the API session", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "security-1", roles: ["security_admin"] },
    });
    apiMocks.logout.mockResolvedValue(undefined);
    render(<AdminPage />);
    completeLoginForm();
    await screen.findByRole("button", { name: "Sign out" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continue securely" }),
      ).toBeInTheDocument(),
    );
    expect(apiMocks.logout).toHaveBeenCalledOnce();
  });

  it("shows the score-ordered Protocol Desk queue with flags and filters", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "desk-1", roles: ["desk_officer"] },
    });
    apiMocks.listProtocolDeskQueue.mockResolvedValue({
      items: [
        {
          requestId: "11111111-1111-4111-8111-111111111111",
          reference: "PD-2026-0042",
          state: "screened",
          capacity: "personal",
          organisationName: "African Forum",
          organisationType: "multilateral",
          eventName: "Finance Forum",
          engagementType: "keynote",
          startsAt: new Date("2026-12-01T09:00:00Z"),
          country: "SL",
          locale: "en-GB",
          triageScore: 88,
          flags: [
            {
              type: "unverified",
              severity: "review",
              detail: "Domain mismatch",
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      nextCursor: "next-page",
    });
    apiMocks.getProtocolDeskRequest.mockResolvedValue({
      request: {
        requestId: "11111111-1111-4111-8111-111111111111",
        reference: "PD-2026-0042",
        state: "accepted",
        capacity: "personal",
        organisationName: "African Forum",
        organisationType: "multilateral",
        eventName: "Finance Forum",
        engagementType: "keynote",
        startsAt: new Date("2026-12-01T09:00:00Z"),
        country: "SL",
        locale: "en-GB",
        triageScore: 88,
        flags: [
          {
            flagId: "33333333-3333-4333-8333-333333333333",
            type: "unverified",
            severity: "review",
            detail: "Domain mismatch",
            raisedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        requester: {
          name: "Ama Mensah",
          role: "Director",
          email: "ama@example.test",
        },
        objective: "Mobilise investment",
        audienceDescription: "Ministers and investors",
        contactName: "Kojo",
        contactPhone: "+233200000000",
        triageDimensions: [
          {
            key: "strategic_value",
            score: 90,
            weight: 20,
            factors: ["priority-geography"],
          },
        ],
      },
      nextStates: ["awaiting_decision"],
      events: [
        {
          eventId: "22222222-2222-4222-8222-222222222222",
          requestId: "11111111-1111-4111-8111-111111111111",
          category: "action",
          fromState: "received",
          toState: "screened",
          actorId: "triage",
          actorRole: "system",
          reason: "Screened",
          occurredAt: new Date(),
        },
        {
          eventId: "44444444-4444-4444-8444-444444444444",
          requestId: "11111111-1111-4111-8111-111111111111",
          category: "access",
          fromState: "accepted",
          toState: "accepted",
          actorId: "operator-1",
          actorRole: "principal",
          reason: "Request detail viewed",
          occurredAt: new Date(),
        },
      ],
      notes: [],
      correspondence: [],
      calendarSync: [
        {
          syncId: "55555555-5555-4555-8555-555555555555",
          operation: "upsert",
          status: "failed",
          attempts: 2,
          availableAt: new Date(),
          lastError: "Calendar adapter returned HTTP 503",
        },
      ],
      principalDecisionDelivery: [
        {
          deliveryId: "66666666-6666-4666-8666-666666666666",
          status: "failed",
          attempts: 2,
          availableAt: new Date(),
        },
      ],
    });
    apiMocks.retryProtocolDeskCalendarSync.mockImplementation(() =>
      apiMocks.getProtocolDeskRequest(),
    );
    apiMocks.retryPrincipalDecisionDelivery.mockImplementation(() =>
      apiMocks.getProtocolDeskRequest(),
    );
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(
      await screen.findByRole("button", { name: /Protocol Desk/ }),
    );
    expect(await screen.findByText("PD-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("Operational health")).toBeInTheDocument();
    expect(screen.getByText("Overdue 48-hour responses")).toBeInTheDocument();
    expect(screen.getByText("Failed calendar sync")).toBeInTheDocument();
    expect(screen.getByText("Pending calendar sync")).toBeInTheDocument();
    expect(
      screen.getByText("Failed Principal decision delivery"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pending Principal decision delivery"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Availability starts"), {
      target: { value: "2026-12-01T09:00" },
    });
    fireEvent.change(screen.getByLabelText("Availability ends"), {
      target: { value: "2026-12-01T11:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check availability" }));
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/travel-1.*blackout.*travel/u)).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByTitle("Domain mismatch")).toHaveTextContent(
      "unverified",
    );
    expect(screen.getByText(/scores order review only/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "screened" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(apiMocks.listProtocolDeskQueue).toHaveBeenLastCalledWith({
        state: "screened",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Request detail viewed")).toBeInTheDocument();
    expect(screen.getByText(/principal · operator-1/u)).toBeInTheDocument();
    expect(await screen.findByText("Mobilise investment")).toBeInTheDocument();
    expect(
      screen.getByText("Calendar adapter returned HTTP 503"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry calendar sync" }),
    );
    await waitFor(() =>
      expect(apiMocks.retryProtocolDeskCalendarSync).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "55555555-5555-4555-8555-555555555555",
      ),
    );
    expect(
      screen.getByText("Protocol Note and decision links"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry Principal delivery" }),
    );
    await waitFor(() =>
      expect(apiMocks.retryPrincipalDecisionDelivery).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "66666666-6666-4666-8666-666666666666",
      ),
    );
    expect(screen.getByText("priority-geography")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download Protocol Note" }),
    ).toBeInTheDocument();
    apiMocks.generateProtocolNote.mockRejectedValueOnce(
      new Error("Approved rider unavailable"),
    );
    fireEvent.change(screen.getByLabelText("Speaker-side contact"), {
      target: { value: "Amanor Desk" },
    });
    fireEvent.change(screen.getByLabelText("Speaker-side email"), {
      target: { value: "desk@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Download Protocol Note" }),
    );
    expect(
      await screen.findByText(/could not be generated/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Accepted" }),
    ).not.toBeInTheDocument();
    apiMocks.assignProtocolDeskRequest.mockResolvedValue(
      apiMocks.getProtocolDeskRequest.mock.results[0]?.value,
    );
    fireEvent.change(screen.getByLabelText("Assign to"), {
      target: { value: "desk-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(apiMocks.assignProtocolDeskRequest).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "desk-2",
      ),
    );
    apiMocks.addProtocolDeskNote.mockResolvedValue(
      apiMocks.getProtocolDeskRequest.mock.results[0]?.value,
    );
    fireEvent.change(screen.getByLabelText("Internal note"), {
      target: { value: "Host verified" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() =>
      expect(apiMocks.addProtocolDeskNote).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "Host verified",
      ),
    );
    apiMocks.transitionProtocolDeskRequest.mockResolvedValue(
      apiMocks.getProtocolDeskRequest.mock.results[0]?.value,
    );
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Ready for decision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply transition" }));
    await waitFor(() =>
      expect(apiMocks.transitionProtocolDeskRequest).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "awaiting_decision",
        "Ready for decision",
        undefined,
      ),
    );
    apiMocks.clearProtocolDeskFlag.mockResolvedValue(
      apiMocks.getProtocolDeskRequest.mock.results[0]?.value,
    );
    fireEvent.change(screen.getByLabelText("Clearance reason"), {
      target: { value: "Verified by telephone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear flag" }));
    await waitFor(() =>
      expect(apiMocks.clearProtocolDeskFlag).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
        "Verified by telephone",
      ),
    );
  }, 15_000);

  it("shows a uniform authentication failure without revealing API detail", async () => {
    apiMocks.login.mockRejectedValue(
      new ApiClientError(
        "Internal credential mismatch",
        401,
        "INVALID_CREDENTIALS",
      ),
    );
    render(<AdminPage />);
    completeLoginForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /check your credentials and verification code/i,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      /internal credential mismatch/i,
    );
  });

  it("loads owned sessions and revokes only a non-current active session", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "security-1", roles: ["security_admin"] },
    });
    apiMocks.listSessions.mockResolvedValue([
      {
        sessionId: "session-current",
        familyId: "family-current",
        authenticationMethods: ["pwd", "totp"],
        createdAt: new Date("2026-08-09T18:00:00.000Z"),
        expiresAt: new Date("2027-09-08T18:00:00.000Z"),
        current: true,
      },
      {
        sessionId: "session-other",
        familyId: "family-other",
        authenticationMethods: ["pwd", "totp"],
        createdAt: new Date("2026-08-08T18:00:00.000Z"),
        rotatedAt: new Date("2026-08-09T12:00:00.000Z"),
        expiresAt: new Date("2027-09-07T18:00:00.000Z"),
        current: false,
      },
    ]);
    apiMocks.revokeSession.mockResolvedValue(undefined);
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Security/ }));

    expect(await screen.findByText("Current session")).toBeInTheDocument();
    expect(
      screen.getByText(/use sign out to close the current session/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke session" }));
    await waitFor(() =>
      expect(apiMocks.revokeSession).toHaveBeenCalledWith("session-other"),
    );
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke session" }),
    ).not.toBeInTheDocument();
  });

  it("provides a recoverable session-loading error state", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "principal-1", roles: ["principal"] },
    });
    apiMocks.listSessions
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([]);
    apiMocks.listAdministrators.mockResolvedValue([]);
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Security/ }));

    expect(
      await screen.findByText(/sessions could not be loaded/i),
    ).toHaveTextContent(/sessions could not be loaded/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(/no sessions were returned/i),
    ).toBeInTheDocument();
    expect(apiMocks.listSessions).toHaveBeenCalledTimes(2);
  });

  it("loads immutable CMS history, creates a draft, and submits it for review", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    const firstVersion = {
      documentType: "page",
      documentId: "home",
      version: 1,
      state: "draft",
      authorId: "editor-1",
      payload: { slug: "/", title: { "en-GB": "Home" } },
    } as const;
    const secondVersion = { ...firstVersion, version: 2 } as const;
    apiMocks.listContentVersions.mockResolvedValue([firstVersion]);
    apiMocks.createContentDraft.mockResolvedValue(secondVersion);
    apiMocks.transitionContentVersion.mockResolvedValue({
      ...secondVersion,
      state: "in_review",
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));

    expect(await screen.findByText("Version 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(
      (screen.getByLabelText("Draft payload as JSON") as HTMLTextAreaElement)
        .value,
    ).toContain('"slug": "/"');
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() =>
      expect(apiMocks.createContentDraft).toHaveBeenCalledWith(
        "page",
        "home",
        firstVersion.payload,
      ),
    );
    expect(await screen.findByText("Version 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(apiMocks.transitionContentVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: "page",
          documentId: "home",
          version: 2,
          action: "submit",
        }),
      ),
    );
    expect(
      await screen.findByText(/version 2 is now in review/i),
    ).toBeInTheDocument();
  });

  it("tracks bilingual page parity and marks French stale after English changes", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    apiMocks.listContentVersions.mockResolvedValue([]);
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));
    await screen.findByText(/No versions exist yet/i);

    fireEvent.click(
      screen.getByRole("button", { name: "Initialise page fields" }),
    );
    expect(screen.getByLabelText("Open Graph image")).toBeInTheDocument();
    const englishTitle = screen.getByLabelText("Page title, English");
    const frenchTitle = screen.getByLabelText("Page title, French");
    const titleStatus = screen.getByLabelText("Page title translation status");

    expect(titleStatus).toHaveValue("missing");
    fireEvent.change(frenchTitle, { target: { value: "Accueil" } });
    expect(titleStatus).toHaveValue("current");
    fireEvent.change(englishTitle, { target: { value: "Home" } });
    expect(titleStatus).toHaveValue("stale");

    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(
      (screen.getByLabelText("Draft payload as JSON") as HTMLTextAreaElement)
        .value,
    ).toContain('"fr-FR": "Accueil"');
  });

  it("browses content records and selects one for version lookup", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    apiMocks.listContentDocuments.mockResolvedValue({
      items: [
        {
          documentType: "page",
          documentId: "record",
          latestVersion: 3,
          state: "in_review",
          updatedAt: new Date("2026-08-09T00:00:00Z"),
        },
      ],
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Browse records" }));

    expect(await screen.findByText("v3 · in review")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /select record, version 3/i }),
    );
    expect(screen.getByLabelText("Document ID")).toHaveValue("record");
  });

  it("offers an authoritative reload after a concurrent workflow conflict", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    const version = {
      documentType: "page",
      documentId: "home",
      version: 1,
      state: "draft",
      authorId: "editor-1",
      payload: {},
    } as const;
    apiMocks.listContentVersions.mockResolvedValue([version]);
    apiMocks.transitionContentVersion.mockRejectedValue(
      new ApiClientError(
        "Content changed concurrently; reload and retry",
        400,
        "BAD_REQUEST",
      ),
    );
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));
    await screen.findByText("Version 1");
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    const reload = await screen.findByRole("button", {
      name: "Reload latest version",
    });
    fireEvent.click(reload);
    await waitFor(() =>
      expect(apiMocks.listContentVersions).toHaveBeenCalledTimes(2),
    );
  });

  it("provides structured initialisers for every non-page content schema", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    const selector = screen.getByLabelText("Content type");
    for (const kind of [
      "identity",
      "atlasNode",
      "speakingTheme",
      "signal",
      "archiveItem",
      "source",
      "scholar",
      "officeHoursCycle",
      "officeHoursAnswer",
      "selahEntry",
      "riderTemplate",
      "emailTemplate",
      "blackout",
      "counterparty",
    ]) {
      fireEvent.change(selector, { target: { value: kind } });
      expect(
        screen.getByRole("button", { name: `Initialise ${kind} fields` }),
      ).toBeInTheDocument();
    }
  });

  it("exposes the governed AMANOR-041 collection fields", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    const selector = screen.getByLabelText("Content type");
    const fields = [
      ["scholar", "Consent notice version"],
      ["officeHoursCycle", "Draw at"],
      ["officeHoursAnswer", "Entrant consent confirmed"],
      ["selahEntry", "Published at"],
      ["riderTemplate", "Honorarium terms"],
      ["emailTemplate", "Template key"],
    ] as const;
    for (const [kind, field] of fields) {
      fireEvent.change(selector, { target: { value: kind } });
      fireEvent.click(
        screen.getByRole("button", { name: `Initialise ${kind} fields` }),
      );
      expect(
        kind === "riderTemplate"
          ? screen.getByRole("group", { name: field })
          : screen.getByLabelText(field),
      ).toBeInTheDocument();
    }
  });

  it("authors ordered Archive chapter fields without raw JSON editing", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "archiveItem" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Initialise archiveItem fields" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add chapters" }));
    expect(screen.getByLabelText("Anchor slug")).toBeInTheDocument();
    expect(screen.getByLabelText("Chapter label, English")).toBeInTheDocument();
    expect(screen.getByLabelText("Start (seconds)")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("End (seconds)")).toHaveAttribute(
      "type",
      "number",
    );
  });

  it("authors governed Speaking history and media without raw JSON editing", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "speakingTheme" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Initialise speakingTheme fields" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add speaking history" }),
    );
    expect(
      screen.getByLabelText("Engagement title, English"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Host organisation, French"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add speaking media" }));
    expect(screen.getByLabelText("Governed media")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Related Archive transcript slug"),
    ).toBeInTheDocument();
  });

  it("creates a backend-valid source payload from structured controls", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "editor-1", roles: ["editor"] },
    });
    apiMocks.createContentDraft.mockResolvedValue({
      documentType: "source",
      documentId: "home",
      version: 1,
      state: "draft",
      authorId: "editor-1",
      payload: {},
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "source" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Initialise source fields" }),
    );
    fireEvent.change(screen.getByLabelText("Reference ID"), {
      target: { value: "source-1" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Official record" },
    });
    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "Institution" },
    });
    fireEvent.change(screen.getByLabelText("Accessed date"), {
      target: { value: "2026-08-09" },
    });
    fireEvent.change(screen.getByLabelText("Source type"), {
      target: { value: "official" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() =>
      expect(apiMocks.createContentDraft).toHaveBeenCalledWith(
        "source",
        "home",
        {
          ref: "source-1",
          title: "Official record",
          publisher: "Institution",
          accessedAt: "2026-08-09T00:00:00.000Z",
          type: "official",
        },
      ),
    );
  });

  it("restores a superseded version and prepares a portable audit download", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "reviewer-1", roles: ["reviewer"] },
    });
    const versions = [
      {
        documentType: "page",
        documentId: "home",
        version: 2,
        state: "published",
        authorId: "editor-1",
        payload: {},
      },
      {
        documentType: "page",
        documentId: "home",
        version: 1,
        state: "superseded",
        authorId: "editor-1",
        payload: {},
      },
    ] as const;
    apiMocks.listContentVersions.mockResolvedValue(versions);
    apiMocks.rollbackContentVersion.mockResolvedValue({
      documentType: "page",
      documentId: "home",
      version: 1,
      locale: "en-GB",
      publishedAt: new Date(),
    });
    apiMocks.exportContentAudit.mockResolvedValue({
      format: "amanor-editorial-audit-v2",
      generatedAt: new Date(),
      documentType: "page",
      documentId: "home",
      events: [],
      integrity: { status: "valid", checkedEvents: 0 },
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));
    fireEvent.click(await screen.findByRole("button", { name: /Version 1/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore this version" }),
    );
    await waitFor(() =>
      expect(apiMocks.rollbackContentVersion).toHaveBeenCalledWith({
        documentType: "page",
        documentId: "home",
        version: 1,
        locale: "en-GB",
      }),
    );
    expect(await screen.findByText(/Restored version 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export audit" }));
    expect(
      await screen.findByRole("link", {
        name: "Download signed-chain audit JSON",
      }),
    ).toHaveAttribute("download", "page-home-audit.json");
  });

  it("requires confirmation before an audited locale takedown", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "principal-1", roles: ["principal"] },
    });
    const versions = [
      {
        documentType: "page",
        documentId: "home",
        version: 2,
        state: "published",
        authorId: "editor-1",
        payload: {},
      },
    ] as const;
    apiMocks.listContentVersions.mockResolvedValue(versions);
    apiMocks.unpublishContent.mockResolvedValue({
      documentType: "page",
      documentId: "home",
      version: 2,
      locale: "en-GB",
      unpublishedAt: new Date(),
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));
    fireEvent.click(await screen.findByRole("button", { name: /Version 2/ }));

    fireEvent.click(screen.getByRole("button", { name: "Prepare unpublish" }));
    expect(apiMocks.unpublishContent).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm en-GB takedown" }),
    );

    await waitFor(() =>
      expect(apiMocks.unpublishContent).toHaveBeenCalledWith({
        documentType: "page",
        documentId: "home",
        locale: "en-GB",
      }),
    );
    expect(
      await screen.findByText(/publication removed.*takedown is audited/i),
    ).toBeInTheDocument();
  });

  it("shows editorial chain integrity and field-level changes", async () => {
    apiMocks.login.mockResolvedValue({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
      expiresIn: 300,
      user: { id: "reviewer-1", roles: ["reviewer"] },
    });
    apiMocks.listContentVersions.mockResolvedValue([]);
    apiMocks.listContentAudit.mockResolvedValue([
      {
        eventId: "event-1",
        documentType: "page",
        documentId: "home",
        version: 2,
        actorId: "editor-1",
        action: "edited",
        sequence: 2,
        occurredAt: new Date(),
        metadata: { state: "draft" },
        changes: [{ path: "/title", before: "Draft", after: "Approved" }],
        previousEventHash: "a".repeat(64),
        eventHash: "b".repeat(64),
      },
    ]);
    apiMocks.getContentAuditIntegrity.mockResolvedValue({
      status: "valid",
      checkedEvents: 2,
      headSequence: 2,
    });
    render(<AdminPage />);
    completeLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: /Content/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));
    const auditButton = screen.getByRole("button", { name: "Audit trail" });
    await waitFor(() => expect(auditButton).toBeEnabled());
    fireEvent.click(auditButton);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Chain valid: 2 events verified",
    );
    fireEvent.click(screen.getByText("1 recorded change"));
    expect(screen.getByText("/title")).toBeInTheDocument();
    expect(screen.getByText(/Draft.*Approved/)).toBeInTheDocument();
  });
});
