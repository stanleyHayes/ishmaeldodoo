import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeAdministratorRoles,
  listAdministrators,
  setAdministratorDisabled,
  inviteAdministrator,
} from "../../lib/api/client";
import { AdministratorManager } from "./administrator-manager";

vi.mock("../../lib/api/client", () => ({
  listAdministrators: vi.fn(),
  changeAdministratorRoles: vi.fn(),
  setAdministratorDisabled: vi.fn(),
  inviteAdministrator: vi.fn(),
}));

const users = [
  {
    userId: "security-1",
    emailCanonical: "security@example.test",
    roles: ["security_admin" as const],
    roleVersion: 1,
  },
  {
    userId: "editor-2",
    emailCanonical: "editor@example.test",
    roles: ["editor" as const],
    roleVersion: 1,
  },
  {
    userId: "principal-1",
    emailCanonical: "principal@example.test",
    roles: ["principal" as const],
    roleVersion: 1,
  },
];

describe("AdministratorManager", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(listAdministrators).mockResolvedValue(users);
    vi.mocked(changeAdministratorRoles).mockReset();
    vi.mocked(setAdministratorDisabled).mockReset();
    vi.mocked(inviteAdministrator).mockReset();
  });

  it("protects self and Principal accounts while saving roles with explicit feedback", async () => {
    vi.mocked(changeAdministratorRoles).mockResolvedValue({
      ...users[1]!,
      roles: ["editor", "reviewer"],
      roleVersion: 2,
    });
    render(<AdministratorManager currentUserId="security-1" />);
    await screen.findByText("editor@example.test");

    const self = screen.getByText("security@example.test").closest("li")!;
    const principal = screen.getByText("principal@example.test").closest("li")!;
    expect(self.querySelector("fieldset")).toBeDisabled();
    expect(principal.querySelector("fieldset")).toBeDisabled();

    const editor = screen.getByText("editor@example.test").closest("li")!;
    fireEvent.click(within(editor).getByLabelText("editor"));
    fireEvent.click(within(editor).getByLabelText("reviewer"));
    fireEvent.click(within(editor).getByRole("button", { name: "Save roles" }));
    await waitFor(() =>
      expect(changeAdministratorRoles).toHaveBeenCalledWith("editor-2", [
        "reviewer",
      ]),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /sessions were revoked/u,
    );
  });

  it("requires a second deliberate action before disabling an account", async () => {
    vi.mocked(setAdministratorDisabled).mockResolvedValue({
      ...users[1]!,
      roleVersion: 2,
      disabledAt: new Date("2026-08-10T00:00:00.000Z"),
    });
    render(<AdministratorManager currentUserId="security-1" />);
    const editor = (await screen.findByText("editor@example.test")).closest(
      "li",
    )!;
    fireEvent.click(
      within(editor).getByRole("button", { name: "Disable account" }),
    );
    expect(setAdministratorDisabled).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm disable" }));
    await waitFor(() =>
      expect(setAdministratorDisabled).toHaveBeenCalledWith("editor-2", true),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/account disabled/iu);
  });

  it("creates a non-Principal one-time invitation and displays its link", async () => {
    vi.mocked(inviteAdministrator).mockResolvedValue({
      administrator: {
        userId: "invited-3",
        emailCanonical: "invited@example.test",
        roles: ["editor"],
        roleVersion: 1,
      },
      invitationToken: "a".repeat(43),
    });
    render(<AdministratorManager currentUserId="security-1" />);
    await screen.findByText("editor@example.test");
    fireEvent.change(screen.getByLabelText("Administrator email"), {
      target: { value: "invited@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Invite administrator" }),
    );
    await waitFor(() =>
      expect(inviteAdministrator).toHaveBeenCalledWith({
        email: "invited@example.test",
        roles: ["editor"],
      }),
    );
    expect(screen.getByLabelText("One-time invitation link")).toHaveValue(
      `http://localhost:3000/?invitation=${"a".repeat(43)}`,
    );
    expect(screen.getByText("invited@example.test")).toBeInTheDocument();
  });
});
