import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomRecipientKey } from "@amanor/contracts";
import { RoomChannel } from "./room-channel";

const loadRoomRecipientKey = vi.fn();
const submitRoomEnquiry = vi.fn();

vi.mock("../../lib/room/client", () => ({
  loadRoomRecipientKey: (...args: unknown[]) => loadRoomRecipientKey(...args),
  submitRoomEnquiry: (...args: unknown[]) => submitRoomEnquiry(...args),
}));

const recipient = {
  keyId: "rk-principal-2026",
  epoch: 3,
  algorithm: "ECDH-P256",
  purpose: "room-enquiry",
  publicKey: "A".repeat(87),
  notBefore: "2026-01-01T00:00:00.000Z",
  notAfter: "2027-01-01T00:00:00.000Z",
  status: "active",
} satisfies RoomRecipientKey;

function fill() {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "A Counterparty" },
  });
  fireEvent.change(screen.getByLabelText("Your email address"), {
    target: { value: "counterparty@example.org" },
  });
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Lite facility structuring" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: {
      value: "A sufficiently detailed confidential message for the channel.",
    },
  });
}

beforeEach(() => {
  loadRoomRecipientKey.mockReset();
  submitRoomEnquiry.mockReset();
});

describe("RoomChannel", () => {
  it("states the procurement prohibition before any input exists", async () => {
    loadRoomRecipientKey.mockResolvedValue(recipient);
    render(<RoomChannel locale="en-GB" />);

    const prohibition = screen.getByText(/not a channel for procurement/iu);
    expect(prohibition).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toBeInTheDocument(),
    );
    expect(
      prohibition.compareDocumentPosition(screen.getByLabelText("Message")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no input at all when the recipient key cannot be verified", async () => {
    loadRoomRecipientKey.mockRejectedValue(new Error("unavailable"));
    render(<RoomChannel locale="en-GB" />);

    await waitFor(() =>
      expect(
        screen.getByText("The confidential channel is closed"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Use the general contact page" }),
    ).toHaveAttribute("href", "/contact");
  });

  it("offers the French reciprocal contact route when closed", async () => {
    loadRoomRecipientKey.mockRejectedValue(new Error("unavailable"));
    render(<RoomChannel locale="fr-FR" />);

    await waitFor(() =>
      expect(
        screen.getByText("Le canal confidentiel est fermé"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", {
        name: "Utiliser la page de contact générale",
      }),
    ).toHaveAttribute("href", "/fr/contact");
  });

  it("shows the reference and deletion date after a successful submission", async () => {
    loadRoomRecipientKey.mockResolvedValue(recipient);
    submitRoomEnquiry.mockResolvedValue({
      reference: "RM-2026-A2B3C4D5E6F7G2H3",
      status: "received",
      deleteAfter: "2027-02-06T00:00:00.000Z",
    });
    render(<RoomChannel locale="en-GB" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toBeInTheDocument(),
    );

    fill();
    fireEvent.submit(
      screen.getByRole("button", { name: "Encrypt and send" }).closest("form")!,
    );

    await waitFor(() =>
      expect(screen.getByText("RM-2026-A2B3C4D5E6F7G2H3")).toBeInTheDocument(),
    );
    expect(screen.getByText(/2027-02-06/u)).toBeInTheDocument();
    // The form is gone: there is nothing left holding the plaintext.
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });

  it("reports a failed send without claiming anything was stored", async () => {
    loadRoomRecipientKey.mockResolvedValue(recipient);
    submitRoomEnquiry.mockRejectedValue(new Error("unavailable"));
    render(<RoomChannel locale="en-GB" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toBeInTheDocument(),
    );

    fill();
    fireEvent.submit(
      screen.getByRole("button", { name: "Encrypt and send" }).closest("form")!,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Nothing was transmitted or stored/iu),
      ).toBeInTheDocument(),
    );
  });

  it("does not transmit an incomplete message", async () => {
    loadRoomRecipientKey.mockResolvedValue(recipient);
    render(<RoomChannel locale="en-GB" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "A Counterparty" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Encrypt and send" }).closest("form")!,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Please complete every required field before sending.",
        ),
      ).toBeInTheDocument(),
    );
    expect(submitRoomEnquiry).not.toHaveBeenCalled();
  });

  it("tells the submitter attachments are not accepted", async () => {
    loadRoomRecipientKey.mockResolvedValue(recipient);
    render(<RoomChannel locale="en-GB" />);
    expect(
      screen.getByText(/Attachments are not accepted/iu),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toBeInTheDocument(),
    );
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
