import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactForm } from "./contact-form";

describe("ContactForm", () => {
  it("routes specialist enquiries and submits a consented minimal payload", async () => {
    const delivery = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reference: "GC-2026-ABC12345" }), {
        status: 202,
      }),
    );
    vi.stubGlobal("fetch", delivery);
    render(<ContactForm locale="en-GB" />);
    // One intact sentence: nothing may split it, or text assertions against it
    // start depending on how an engine resolves a parent's text content.
    expect(screen.getByText(/not The Room/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Protocol Desk" })).toHaveAttribute(
      "href",
      "/speaking/request",
    );
    // The Room must be reachable, not merely named.
    expect(screen.getByRole("link", { name: "The Room" })).toHaveAttribute(
      "href",
      "/contact/room",
    );
    expect(screen.getByRole("link", { name: "Open The Room" })).toHaveAttribute(
      "href",
      "/contact/room",
    );
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Ama Mensah" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ama@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Public record question" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "A sufficiently detailed general contact message." },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(
      screen.getByRole("button", { name: "Send message" }).closest("form")!,
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Message received: GC-2026-ABC12345",
      ),
    );
    expect(delivery).toHaveBeenCalledWith(
      "/api/contact-enquiries",
      expect.objectContaining({
        body: expect.stringContaining('"privacyConsent":true'),
      }),
    );
    vi.unstubAllGlobals();
  });
});
