import { describe, expect, it } from "vitest";
import {
  calculateEditorialAuditHash,
  createEditorialAuditEvent,
  createEditorialDiff,
} from "./audit";

describe("editorial audit chain", () => {
  it("creates immutable-addressable event hashes linked to the previous event", () => {
    const first = createEditorialAuditEvent(
      {
        documentType: "page",
        documentId: "home",
        version: 1,
        actorId: "editor-1",
        action: "submitted",
        sequence: 1,
        metadata: {},
        changes: [],
      },
      new Date("2026-08-09T00:00:00Z"),
    );
    const second = createEditorialAuditEvent(
      {
        documentType: "page",
        documentId: "home",
        version: 1,
        actorId: "reviewer-2",
        action: "approved",
        sequence: 2,
        metadata: {},
        changes: [],
        previousEventHash: first.eventHash,
      },
      new Date("2026-08-09T00:01:00Z"),
    );

    expect(first.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.previousEventHash).toBe(first.eventHash);
    expect(second.eventHash).not.toBe(first.eventHash);
  });

  it("records stable JSON-pointer changes without unchanged fields", () => {
    expect(
      createEditorialDiff(
        { title: "Draft", nested: { kept: true, count: 1 } },
        { title: "Approved", nested: { kept: true, count: 2 } },
      ),
    ).toEqual([
      { path: "/nested/count", before: 1, after: 2 },
      { path: "/title", before: "Draft", after: "Approved" },
    ]);
  });

  it("binds sequence and field changes into the event hash", () => {
    const event = createEditorialAuditEvent(
      {
        documentType: "page",
        documentId: "home",
        version: 2,
        actorId: "editor-1",
        action: "edited",
        sequence: 2,
        metadata: { state: "draft" },
        changes: [{ path: "/title", before: "A", after: "B" }],
        previousEventHash: "a".repeat(64),
      },
      new Date("2026-08-09T00:02:00Z"),
    );
    expect(calculateEditorialAuditHash(event)).toBe(event.eventHash);
    expect(
      calculateEditorialAuditHash({
        ...event,
        changes: [{ path: "/title", before: "A", after: "tampered" }],
      }),
    ).not.toBe(event.eventHash);
  });
});
