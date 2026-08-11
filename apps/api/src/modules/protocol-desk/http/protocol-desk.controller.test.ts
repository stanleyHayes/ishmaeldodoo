import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProtocolDeskController } from "./protocol-desk.controller";
import type { ProtocolDeskService } from "../application/protocol-desk.service";

describe("ProtocolDeskController", () => {
  it("returns the durable reference from the application service", async () => {
    const submit = vi
      .fn()
      .mockResolvedValue({ reference: "PD-2026-0001", state: "received" });
    const controller = new ProtocolDeskController({
      submit,
    } as unknown as ProtocolDeskService);
    await expect(controller.submit({ valid: true })).resolves.toEqual({
      reference: "PD-2026-0001",
      state: "received",
    });
  });

  it("maps runtime validation failures to a safe 400 response", async () => {
    const submit = vi
      .fn()
      .mockRejectedValue(
        new (await import("zod")).ZodError([
          { code: "custom", path: ["capacity"], message: "Required" },
        ]),
      );
    const controller = new ProtocolDeskController({
      submit,
    } as unknown as ProtocolDeskService);
    await expect(controller.submit({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("does not disguise infrastructure failures as validation errors", async () => {
    const failure = new Error("database unavailable");
    const controller = new ProtocolDeskController({
      submit: vi.fn().mockRejectedValue(failure),
    } as unknown as ProtocolDeskService);
    await expect(controller.submit({})).rejects.toBe(failure);
  });

  it("accepts a valid one-time Principal decision only through a POST body", async () => {
    const decideWithCapability = vi.fn().mockResolvedValue({
      reference: "PD-2026-0001",
      state: "held",
    });
    const controller = new ProtocolDeskController({
      decideWithCapability,
    } as unknown as ProtocolDeskService);
    const input = {
      token: "a".repeat(43),
      action: "hold",
      reason: "Awaiting a final diary check",
    } as const;
    await expect(controller.decide(input)).resolves.toEqual({
      reference: "PD-2026-0001",
      state: "held",
    });
    expect(decideWithCapability).toHaveBeenCalledWith(input);
    await expect(
      controller.decide({ ...input, token: "short" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
