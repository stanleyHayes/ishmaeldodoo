import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSelect } from "./admin-select";
import { AdminTemporalField } from "./admin-temporal-field";

describe("AdminSelect", () => {
  it("supports keyboard selection and submits the native field value", () => {
    render(
      <form data-testid="form">
        <AdminSelect label="State" name="state" defaultValue="open">
          <option value="open">Open</option>
          <option value="held">Held</option>
        </AdminSelect>
      </form>,
    );
    const trigger = screen.getByRole("button", { name: /State: Open/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger).toHaveTextContent("Held");
    expect(
      new FormData(screen.getByTestId("form") as HTMLFormElement).get("state"),
    ).toBe("held");
  });

  it("dismisses the operator listbox with Escape", () => {
    render(
      <AdminSelect label="Role" defaultValue="editor">
        <option value="editor">Editor</option>
        <option value="principal">Principal</option>
      </AdminSelect>,
    );
    const trigger = screen.getByRole("button", { name: /Role: Editor/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("uses the authored calendar while retaining a submitted date value", () => {
    render(
      <form data-testid="date-form">
        <AdminTemporalField
          label="Retain until"
          name="retainUntil"
          mode="date"
          defaultValue="2026-08-12"
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retain until" }));
    expect(
      screen.getByRole("dialog", { name: "Retain until" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-08-21" }));
    expect(
      new FormData(screen.getByTestId("date-form") as HTMLFormElement).get(
        "retainUntil",
      ),
    ).toBe("2026-08-21");
  });
});
