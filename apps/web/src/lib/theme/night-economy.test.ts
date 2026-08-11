import { describe, expect, it } from "vitest";
import {
  automaticAccraTheme,
  resolveTheme,
  themePreference,
} from "./night-economy";

describe("Night Economy schedule", () => {
  it("follows Accra UTC hours from 18:00 through 05:59", () => {
    expect(automaticAccraTheme(new Date("2026-08-09T17:59:59Z"))).toBe("day");
    expect(automaticAccraTheme(new Date("2026-08-09T18:00:00Z"))).toBe("night");
    expect(automaticAccraTheme(new Date("2026-08-10T05:59:59Z"))).toBe("night");
    expect(automaticAccraTheme(new Date("2026-08-10T06:00:00Z"))).toBe("day");
  });

  it("accepts persistent day/night overrides and rejects unknown values", () => {
    expect(themePreference("day")).toBe("day");
    expect(themePreference("night")).toBe("night");
    expect(themePreference("system")).toBe("auto");
    expect(resolveTheme("day", new Date("2026-08-09T22:00:00Z"))).toBe("day");
    expect(resolveTheme("night", new Date("2026-08-09T12:00:00Z"))).toBe(
      "night",
    );
  });

  it("keeps the declared night text palette above WCAG AA contrast", () => {
    function luminance(hex: string): number {
      const channels = hex.match(/[a-f\d]{2}/giu)!.map((value) => {
        const channel = Number.parseInt(value, 16) / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return (
        0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
      );
    }
    function ratio(foreground: string, background: string): number {
      const values = [luminance(foreground), luminance(background)].sort(
        (left, right) => right - left,
      );
      return (values[0]! + 0.05) / (values[1]! + 0.05);
    }
    expect(ratio("#e8e6e1", "#0e1114")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#a8afb8", "#0e1114")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#79b6cf", "#0e1114")).toBeGreaterThanOrEqual(4.5);
  });
});
