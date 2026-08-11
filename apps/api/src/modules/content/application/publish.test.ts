import { describe, expect, it, vi } from "vitest";
import type { ContentVersion } from "../domain/workflow";
import {
  publishContent,
  type PublicationRepositories,
  type PublicationUnitOfWork,
} from "./publish";

function fixture(state: ContentVersion["state"] = "approved") {
  const version: ContentVersion = {
    documentType: "source",
    documentId: "source-1",
    version: 2,
    state,
    authorId: "editor-1",
    reviewerId: "reviewer-1",
    payload: {
      ref: "SRC-001",
      title: "Named source",
      publisher: "Publisher",
      accessedAt: new Date("2026-08-09"),
      type: "official",
    },
  };
  const repositories: PublicationRepositories = {
    findApprovedVersion: vi.fn().mockResolvedValue(version),
    currentAuditHash: vi.fn().mockResolvedValue("previous-hash"),
    findMissingPublishedSourceRefs: vi.fn().mockResolvedValue([]),
    upsertPublication: vi.fn().mockResolvedValue(undefined),
    appendAudit: vi.fn().mockResolvedValue(undefined),
    enqueueRevalidation: vi.fn().mockResolvedValue(undefined),
  };
  const unitOfWork: PublicationUnitOfWork = {
    transaction: (operation) => operation(repositories),
  };
  return { repositories, unitOfWork };
}

describe("publishContent", () => {
  it("updates the publication pointer, audit chain and revalidation outbox atomically", async () => {
    const { repositories, unitOfWork } = fixture();
    const publication = await publishContent(
      unitOfWork,
      {
        documentType: "source",
        documentId: "source-1",
        version: 2,
        locale: "en-GB",
        actor: { id: "reviewer-1", roles: ["reviewer"] },
      },
      new Date("2026-08-09T12:00:00Z"),
    );

    expect(publication.version).toBe(2);
    expect(repositories.upsertPublication).toHaveBeenCalledOnce();
    expect(repositories.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        previousEventHash: "previous-hash",
        action: "published",
      }),
    );
    expect(repositories.enqueueRevalidation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "publish:source:source-1:en-GB:2",
        tags: expect.arrayContaining([
          "content:source:source-1",
          "locale:en-GB",
        ]),
      }),
    );
  });

  it("fails closed for draft content or an unauthorised actor", async () => {
    const draft = fixture("draft");
    await expect(
      publishContent(draft.unitOfWork, {
        documentType: "source",
        documentId: "source-1",
        version: 2,
        locale: "en-GB",
        actor: { id: "reviewer-1", roles: ["reviewer"] },
      }),
    ).rejects.toThrow(/approved/i);

    const approved = fixture();
    await expect(
      publishContent(approved.unitOfWork, {
        documentType: "source",
        documentId: "source-1",
        version: 2,
        locale: "en-GB",
        actor: { id: "editor-1", roles: ["editor"] },
      }),
    ).rejects.toThrow(/reviewer or principal/i);
  });
});
