import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentedCodeInput } from "./segmented-code-input";

afterEach(() => cleanup());

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

function box(index: number): HTMLInputElement {
  const element = boxes()[index];
  if (!element) throw new Error(`No segmented box at index ${index}`);
  return element;
}

function hiddenValue(name: string): string {
  const hidden = document.querySelector<HTMLInputElement>(
    `input[type="hidden"][name="${name}"]`,
  );
  return hidden?.value ?? "";
}

function renderNumeric(onValueChange = vi.fn()) {
  render(
    <form>
      <span id="mfa-label">Authenticator code</span>
      <SegmentedCodeInput
        name="mfaCode"
        labelId="mfa-label"
        groups={[6]}
        onValueChange={onValueChange}
      />
    </form>,
  );
  return { onValueChange };
}

function type(index: number, digits: string) {
  for (const [offset, digit] of Array.from(digits).entries())
    fireEvent.change(box(index + offset), { target: { value: digit } });
}

describe("SegmentedCodeInput", () => {
  it("renders one box per character with numbered accessible labels", () => {
    renderNumeric();
    expect(boxes()).toHaveLength(6);
    expect(box(0)).toHaveAttribute("aria-label", "Digit 1 of 6");
    expect(box(5)).toHaveAttribute("aria-label", "Digit 6 of 6");
    expect(box(0)).toHaveAttribute("autocomplete", "one-time-code");
    expect(box(1)).toHaveAttribute("autocomplete", "off");
  });

  it("joins typed digits into the hidden input under the field name", () => {
    const { onValueChange } = renderNumeric();
    type(0, "123456");
    expect(hiddenValue("mfaCode")).toBe("123456");
    expect(onValueChange).toHaveBeenLastCalledWith("123456");
  });

  it("advances focus to the next box after a valid entry", () => {
    renderNumeric();
    fireEvent.change(box(0), { target: { value: "7" } });
    expect(document.activeElement).toBe(box(1));
  });

  it("ignores characters outside the allowed set", () => {
    const { onValueChange } = renderNumeric();
    fireEvent.change(box(0), { target: { value: "a" } });
    expect(hiddenValue("mfaCode")).toBe("");
    expect(onValueChange).not.toHaveBeenCalledWith("a");
  });

  it("moves to and clears the previous box on backspace when empty", () => {
    renderNumeric();
    type(0, "12");
    expect(hiddenValue("mfaCode")).toBe("12");
    // Focus is on box 2 (empty); backspace should retreat to box 1 and clear it.
    fireEvent.keyDown(box(2), { key: "Backspace" });
    expect(hiddenValue("mfaCode")).toBe("1");
    expect(document.activeElement).toBe(box(1));
  });

  it("clears the current box on backspace when it has a value", () => {
    renderNumeric();
    fireEvent.change(box(0), { target: { value: "9" } });
    fireEvent.keyDown(box(0), { key: "Backspace" });
    expect(hiddenValue("mfaCode")).toBe("");
  });

  it("supports arrow navigation and delete", () => {
    renderNumeric();
    fireEvent.change(box(0), { target: { value: "5" } });
    fireEvent.keyDown(box(1), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(box(0));
    fireEvent.keyDown(box(0), { key: "ArrowRight" });
    expect(document.activeElement).toBe(box(1));
    fireEvent.keyDown(box(0), { key: "Delete" });
    expect(hiddenValue("mfaCode")).toBe("");
  });

  it("distributes a pasted code across boxes", () => {
    const { onValueChange } = renderNumeric();
    fireEvent.paste(box(0), { clipboardData: { getData: () => "246810" } });
    expect(hiddenValue("mfaCode")).toBe("246810");
    expect(onValueChange).toHaveBeenLastCalledWith("246810");
  });

  it("clears every box when the surrounding form resets", () => {
    renderNumeric();
    type(0, "123");
    expect(hiddenValue("mfaCode")).toBe("123");
    const form = box(0).closest("form");
    fireEvent.reset(form as HTMLFormElement);
    expect(hiddenValue("mfaCode")).toBe("");
  });

  it("groups, uppercases and hyphen-joins a recovery code", () => {
    const onValueChange = vi.fn();
    render(
      <form>
        <span id="rc-label">Recovery code</span>
        <SegmentedCodeInput
          name="recoveryCode"
          labelId="rc-label"
          groups={[4, 4, 4, 4]}
          separator="-"
          inputMode="text"
          allow={/[A-Z2-9]/}
          transform={(raw) => raw.toUpperCase()}
          onValueChange={onValueChange}
        />
      </form>,
    );
    expect(boxes()).toHaveLength(16);
    // Pasting the full code (with hyphens and lowercase) normalises and splits.
    fireEvent.paste(box(0), {
      clipboardData: { getData: () => "abcd-2345-efgh-6789" },
    });
    expect(hiddenValue("recoveryCode")).toBe("ABCD-2345-EFGH-6789");
    expect(onValueChange).toHaveBeenLastCalledWith("ABCD-2345-EFGH-6789");
  });

  it("renders visible separators between recovery groups", () => {
    render(
      <form>
        <span id="rc-label">Recovery code</span>
        <SegmentedCodeInput
          name="recoveryCode"
          labelId="rc-label"
          groups={[4, 4, 4, 4]}
          separator="-"
        />
      </form>,
    );
    expect(
      screen.getAllByText("-", { selector: ".segmented-code__separator" }),
    ).toHaveLength(3);
  });
});
