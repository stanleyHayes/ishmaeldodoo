import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateHardwareKey,
  createHardwareKeyAuthenticationOptions,
  createHardwareKeyRegistrationOptions,
  listHardwareKeys,
  registerHardwareKey,
  rotateRecoveryCodes,
  stepUp,
} from "../../lib/api/client";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { StepUpPanel } from "./step-up-panel";

vi.mock("../../lib/api/client", () => ({
  stepUp: vi.fn(),
  rotateRecoveryCodes: vi.fn(),
  listHardwareKeys: vi.fn().mockResolvedValue([]),
  createHardwareKeyRegistrationOptions: vi.fn(),
  registerHardwareKey: vi.fn(),
  createHardwareKeyAuthenticationOptions: vi.fn(),
  authenticateHardwareKey: vi.fn(),
  revokeHardwareKey: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

describe("StepUpPanel", () => {
  afterEach(() => cleanup());
  it("requires a fresh authenticator code before enabling high-risk actions", async () => {
    vi.mocked(stepUp).mockResolvedValue({
      accessToken: "elevated-access-token",
      expiresIn: 300,
    });
    render(<StepUpPanel />);
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify recent MFA" }));
    await waitFor(() => expect(stepUp).toHaveBeenCalledWith("123456"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /five minutes/iu,
    );
    vi.mocked(rotateRecoveryCodes).mockResolvedValue({
      recoveryCodes: Array.from({ length: 8 }, () => "ABCD-2345-EFGH-6789"),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Replace recovery codes" }),
    );
    await waitFor(() => expect(rotateRecoveryCodes).toHaveBeenCalledOnce());
    expect(
      screen.getByLabelText("Replacement recovery codes"),
    ).toHaveTextContent("ABCD-2345-EFGH-6789");
  });

  it("enrols and verifies a locally connected security key", async () => {
    vi.mocked(stepUp).mockResolvedValue({
      accessToken: "totp-token",
      expiresIn: 300,
    });
    vi.mocked(createHardwareKeyRegistrationOptions).mockResolvedValue({
      ceremonyId: "32d5429e-aa83-4c54-b3db-ea6c8b0d59fe",
      options: { challenge: "challenge" },
    });
    vi.mocked(startRegistration).mockResolvedValue({
      id: "credential",
      rawId: "credential",
      type: "public-key",
      response: { clientDataJSON: "client", attestationObject: "attestation" },
      clientExtensionResults: {},
    });
    const enrolled = {
      credentialId: "credential",
      label: "Office key",
      deviceType: "singleDevice" as const,
      backedUp: false,
      transports: ["usb"],
      createdAt: new Date("2026-08-11T12:00:00.000Z"),
    };
    vi.mocked(registerHardwareKey).mockResolvedValue(enrolled);
    vi.mocked(listHardwareKeys)
      .mockResolvedValueOnce([])
      .mockResolvedValue([enrolled]);
    vi.mocked(createHardwareKeyAuthenticationOptions).mockResolvedValue({
      ceremonyId: "7d3cadcc-4296-42eb-85e1-905ad0c3a611",
      options: { challenge: "challenge-two" },
    });
    vi.mocked(startAuthentication).mockResolvedValue({
      id: "credential",
      rawId: "credential",
      type: "public-key",
      response: {
        clientDataJSON: "client",
        authenticatorData: "authenticator",
        signature: "signature",
      },
      clientExtensionResults: {},
    });
    vi.mocked(authenticateHardwareKey).mockResolvedValue({
      accessToken: "hardware-token",
      expiresIn: 300,
    });

    render(<StepUpPanel />);
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify recent MFA" }));
    await screen.findByRole("button", { name: "Enrol local security key" });
    fireEvent.change(screen.getByLabelText("Security-key label"), {
      target: { value: "Office key" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enrol local security key" }),
    );
    expect(
      await screen.findByText("Hardware key enrolled."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Verify hardware key" }),
    );
    expect(
      await screen.findByText(/Room access is elevated for five minutes/iu),
    ).toBeInTheDocument();
    expect(registerHardwareKey).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Office key" }),
    );
    expect(authenticateHardwareKey).toHaveBeenCalledWith(
      expect.objectContaining({
        ceremonyId: "7d3cadcc-4296-42eb-85e1-905ad0c3a611",
      }),
    );
  });
});
