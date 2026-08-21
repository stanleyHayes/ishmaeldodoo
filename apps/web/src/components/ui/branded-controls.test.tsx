import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BrandedAlertDialog } from "./branded-dialog";
import { BrandedSelect } from "./branded-select";

const options = [
  { value: "general", label: "General enquiry" },
  { value: "record", label: "Correction to the public record" },
  { value: "access", label: "Accessibility support" },
] as const;

describe("AMANOR branded controls", () => {
  it("operates the select with keyboard and submits the real field value", () => {
    render(
      <form data-testid="form">
        <BrandedSelect
          name="category"
          label="Enquiry type"
          defaultValue="general"
          options={options}
        />
      </form>,
    );
    const trigger = screen.getByRole("button", { name: /Enquiry type:/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger).toHaveTextContent("Correction to the public record");
    expect(
      new FormData(screen.getByTestId("form") as HTMLFormElement).get(
        "category",
      ),
    ).toBe("record");
  });

  it("closes a select with Escape without changing its value", () => {
    render(
      <BrandedSelect
        label="Type de demande"
        defaultValue="general"
        options={options}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Type de demande:/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("General enquiry");
  });

  it("provides an alert-dialog contract without browser alert or confirm", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute("open");
    });
    function Fixture() {
      const [open, setOpen] = useState(true);
      return (
        <BrandedAlertDialog
          open={open}
          title="Remove request?"
          description="This action cannot be undone."
          confirmLabel="Remove"
          cancelLabel="Keep request"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      );
    }
    render(<Fixture />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Remove request?");
    fireEvent.click(screen.getByRole("button", { name: "Keep request" }));
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
  });
});
