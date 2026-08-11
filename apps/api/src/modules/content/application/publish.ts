import type { ContentKind, EditorialActor, Locale } from "../domain/types";
import {
  collectSourceReferences,
  validateForPublication,
} from "../domain/publication-validation";
import {
  publicationTags,
  type ContentVersion,
  type Publication,
} from "../domain/workflow";
import { createEditorialAuditEvent, type EditorialAuditEvent } from "./audit";

export interface PublicationUnitOfWork {
  transaction<T>(
    operation: (repositories: PublicationRepositories) => Promise<T>,
  ): Promise<T>;
}

export interface PublicationRepositories {
  findApprovedVersion(input: {
    documentType: ContentKind;
    documentId: string;
    version: number;
  }): Promise<ContentVersion | null>;
  currentAuditHash(
    documentType: ContentKind,
    documentId: string,
  ): Promise<string | undefined>;
  findMissingPublishedSourceRefs(
    references: readonly string[],
    locale: Locale,
  ): Promise<readonly string[]>;
  upsertPublication(publication: Publication): Promise<void>;
  appendAudit(event: EditorialAuditEvent): Promise<void>;
  enqueueRevalidation(input: {
    idempotencyKey: string;
    tags: readonly string[];
  }): Promise<void>;
}

export type PublishCommand = Readonly<{
  documentType: ContentKind;
  documentId: string;
  version: number;
  locale: Locale;
  actor: EditorialActor;
}>;

export async function publishContent(
  unitOfWork: PublicationUnitOfWork,
  command: PublishCommand,
  now = new Date(),
): Promise<Publication> {
  if (
    !command.actor.roles.some(
      (role) => role === "principal" || role === "reviewer",
    )
  ) {
    throw new Error(
      "A reviewer or Principal role is required to publish content",
    );
  }

  return unitOfWork.transaction(async (repositories) => {
    const version = await repositories.findApprovedVersion(command);
    if (
      !version ||
      (version.state !== "approved" && version.state !== "scheduled")
    ) {
      throw new Error("Only an approved content version can be published");
    }

    if (version.scheduledFor && version.scheduledFor > now) {
      throw new Error(
        "Scheduled content cannot publish before its scheduled time",
      );
    }

    const validation = validateForPublication(
      command.documentType,
      version.payload,
      command.locale,
      {
        authorId: version.authorId,
        ...(version.reviewerId ? { reviewerId: version.reviewerId } : {}),
      },
    );
    if (!validation.valid) {
      throw new Error(
        `Publication validation failed: ${validation.errors.join("; ")}`,
      );
    }
    const missingSources = await repositories.findMissingPublishedSourceRefs(
      collectSourceReferences(version.payload),
      command.locale,
    );
    if (missingSources.length > 0)
      throw new Error(
        `Publication validation failed: source references are not published in ${command.locale}: ${missingSources.join(", ")}`,
      );

    const publication: Publication = {
      documentType: command.documentType,
      documentId: command.documentId,
      locale: command.locale,
      version: command.version,
      publishedAt: now,
    };
    const tags = publicationTags(publication);
    const previousEventHash = await repositories.currentAuditHash(
      command.documentType,
      command.documentId,
    );
    const auditEvent = createEditorialAuditEvent(
      {
        documentType: command.documentType,
        documentId: command.documentId,
        version: command.version,
        actorId: command.actor.id,
        action: "published",
        sequence: 1,
        metadata: { locale: command.locale },
        changes: [],
        ...(previousEventHash ? { previousEventHash } : {}),
      },
      now,
    );

    await repositories.upsertPublication(publication);
    await repositories.appendAudit(auditEvent);
    await repositories.enqueueRevalidation({
      idempotencyKey: `publish:${command.documentType}:${command.documentId}:${command.locale}:${command.version}`,
      tags,
    });

    return publication;
  });
}
