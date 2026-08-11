import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { acceptInvitation, getInvitationSetup } from "../../lib/api/client";
import { InvitationAcceptance } from "./invitation-acceptance";

vi.mock("../../lib/api/client", () => ({
  getInvitationSetup: vi.fn(),
  acceptInvitation: vi.fn(),
}));

describe("InvitationAcceptance", () => {
  it("requires password and current TOTP before completing one-time setup", async () => {
    vi.mocked(getInvitationSetup).mockResolvedValue({
      email: "invited@example.test",
      enrollmentUri:
        "otpauth://totp/Project%20AMANOR%3Ainvited%40example.test?secret=ABC",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });
    vi.mocked(acceptInvitation).mockResolvedValue({
      recoveryCodes: [
        "ABCD-2345-EFGH-6789",
        "BCDE-3456-FGHJ-789A",
        "CDEF-4567-GHJK-89AB",
        "DEFG-5678-HJKL-9ABC",
        "EFGH-6789-JKLM-ABCD",
        "FGHJ-789A-KLMN-BCDE",
        "GHJK-89AB-LMNP-CDEF",
        "HJKL-9ABC-MNPQ-DEFG",
      ],
    });
    const token = "a".repeat(43);
    render(<InvitationAcceptance token={token} />);
    await screen.findByText("invited@example.test");
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "a-new-secure-administrator-password" },
    });
    fireEvent.change(screen.getByLabelText("Current authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete secure setup" }),
    );
    await waitFor(() =>
      expect(acceptInvitation).toHaveBeenCalledWith({
        token,
        password: "a-new-secure-administrator-password",
        mfaCode: "123456",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/setup is complete/iu);
    expect(screen.getByLabelText("Recovery codes")).toHaveTextContent(
      "ABCD-2345-EFGH-6789",
    );
  });
});
