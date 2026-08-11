import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomInboxItem, RoomPlaintext } from "@amanor/contracts";
import { clearAuthState, setAuthState } from "../../lib/api/auth-store";
import { RoomWorkspace } from "./room-workspace";

const listRoomInbox = vi.fn();
const fetchRoomCiphertext = vi.fn();
const setRoomEnquiryState = vi.fn();
const extendRoomRetention = vi.fn();

vi.mock("../../lib/room/client", () => ({
  listRoomInbox: (...args: unknown[]) => listRoomInbox(...args),
  fetchRoomCiphertext: (...args: unknown[]) => fetchRoomCiphertext(...args),
  setRoomEnquiryState: (...args: unknown[]) => setRoomEnquiryState(...args),
  extendRoomRetention: (...args: unknown[]) => extendRoomRetention(...args),
}));

const decryptWithRoomKey = vi.fn();
const unlockRoomKey = vi.fn();
const lockRoomKey = vi.fn();
let unlocked = false;
let changeListener: (() => void) | null = null;

vi.mock("../../lib/room/key-holder", () => ({
  decryptWithRoomKey: (...args: unknown[]) => decryptWithRoomKey(...args),
  unlockRoomKey: (...args: unknown[]) => unlockRoomKey(...args),
  lockRoomKey: () => lockRoomKey(),
  installRoomAutoLock: () => () => undefined,
  roomKeyState: () => ({
    unlocked,
    keyId: unlocked ? "rk-principal-2026" : null,
  }),
  onRoomKeyChange: (listener: () => void) => {
    changeListener = listener;
    return () => {
      changeListener = null;
    };
  },
}));

const item: RoomInboxItem = {
  reference: "RM-2026-A2B3C4D5E6F7G2H3",
  state: "received",
  locale: "en-GB",
  recipientKeyId: "rk-principal-2026",
  keyEpoch: 1,
  receivedAt: "2026-08-10T12:00:00.000Z",
  deleteAfter: "2027-02-06T12:00:00.000Z",
  extensionCount: 0,
  ciphertextBytes: 362,
};

const plaintext: RoomPlaintext = {
  subject: "Sahel facility structuring",
  message: "A confidential message that must never leave this browser.",
  fromName: "A Counterparty",
  fromEmail: "counterparty@example.org",
  organisation: "Example Development Bank",
};

beforeEach(() => {
  unlocked = false;
  changeListener = null;
  vi.clearAllMocks();
  setAuthState({ accessToken: "access-1", csrfToken: "csrf-1" });
  listRoomInbox.mockResolvedValue({ items: [item], total: 1 });
  fetchRoomCiphertext.mockResolvedValue({
    reference: item.reference,
    envelope: { ciphertext: "opaque" },
    receivedAt: item.receivedAt,
    deleteAfter: item.deleteAfter,
  });
  decryptWithRoomKey.mockResolvedValue(plaintext);
});

// This suite runs without `globals: true`, so Testing Library never registers
// its own cleanup. Without this, one test's DOM leaks into the next.
afterEach(() => {
  cleanup();
  clearAuthState();
});

describe("RoomWorkspace", () => {
  it("shows no inbox at all without a session", async () => {
    clearAuthState();
    render(<RoomWorkspace />);
    expect(
      screen.getByText(/Sign in to the administration console first/i),
    ).toBeInTheDocument();
    expect(listRoomInbox).not.toHaveBeenCalled();
  });

  it("lists metadata only, and cannot open anything while locked", async () => {
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: item.reference, level: 3 }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("rk-principal-2026 (epoch 1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
    expect(screen.queryByText(plaintext.message)).not.toBeInTheDocument();
  });

  it("reveals plaintext only after unlocking, and never sends it back", async () => {
    unlocked = true;
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: item.reference, level: 3 }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByText(plaintext.message)).toBeInTheDocument(),
    );

    expect(decryptWithRoomKey).toHaveBeenCalledWith({ ciphertext: "opaque" });
    for (const call of setRoomEnquiryState.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(plaintext.message);
    }
    expect(
      screen.getByText(/Do not copy it into email, a ticket/i),
    ).toBeInTheDocument();
  });

  it("clears the plaintext when the reader closes it", async () => {
    unlocked = true;
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: item.reference, level: 3 }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByText(plaintext.message)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close and clear" }));
    expect(screen.queryByText(plaintext.message)).not.toBeInTheDocument();
  });

  it("drops the plaintext the moment the key locks", async () => {
    unlocked = true;
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: item.reference, level: 3 }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByText(plaintext.message)).toBeInTheDocument(),
    );

    unlocked = false;
    changeListener?.();

    await waitFor(() =>
      expect(screen.queryByText(plaintext.message)).not.toBeInTheDocument(),
    );
  });

  it("explains a key mismatch without exposing ciphertext", async () => {
    unlocked = true;
    decryptWithRoomKey.mockRejectedValue(
      new Error("This submission was encrypted to a different key"),
    );
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: item.reference, level: 3 }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(
        screen.getByText("This submission was encrypted to a different key."),
      ).toBeInTheDocument(),
    );
  });

  it("extends retention by category only", async () => {
    unlocked = true;
    extendRoomRetention.mockResolvedValue("2027-05-07T12:00:00.000Z");
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: item.reference, level: 3 }),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Extend retention"), {
      target: { value: "legal_hold" },
    });

    await waitFor(() =>
      expect(extendRoomRetention).toHaveBeenCalledWith(item.reference, {
        reason: "legal_hold",
        days: 90,
      }),
    );
  });

  it("reports an unavailable inbox without inventing an empty one", async () => {
    listRoomInbox.mockRejectedValue(new Error("denied"));
    render(<RoomWorkspace />);
    await waitFor(() =>
      expect(
        screen.getByText("The Room inbox is not available."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: item.reference, level: 3 }),
    ).not.toBeInTheDocument();
  });
});
