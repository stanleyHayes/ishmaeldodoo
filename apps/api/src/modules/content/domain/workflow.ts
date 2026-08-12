import { z } from "zod";
import type { ContentKind, EditorialActor, Locale } from "./types";

export const workflowStates = [
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "superseded",
] as const;

export const workflowStateSchema = z.enum(workflowStates);
export type WorkflowState = z.infer<typeof workflowStateSchema>;

export type ContentVersion = Readonly<{
  documentType: ContentKind;
  documentId: string;
  version: number;
  state: WorkflowState;
  authorId: string;
  reviewerId?: string;
  approvedAt?: Date;
  scheduledFor?: Date;
  payload: unknown;
}>;

export type ContentDocumentSummary = Readonly<{
  documentType: ContentKind;
  documentId: string;
  latestVersion: number;
  state: WorkflowState;
  updatedAt: Date;
}>;

export type ContentDocumentPage = Readonly<{
  items: readonly ContentDocumentSummary[];
  nextCursor?: string;
}>;

export type WorkflowAction =
  | "submit"
  | "request_changes"
  | "approve"
  | "schedule"
  | "publish"
  | "supersede";

const permittedTransitions: Readonly<
  Record<WorkflowState, Partial<Record<WorkflowAction, WorkflowState>>>
> = {
  draft: { submit: "in_review" },
  in_review: { request_changes: "draft", approve: "approved" },
  approved: {
    schedule: "scheduled",
    publish: "published",
    request_changes: "draft",
  },
  scheduled: { publish: "published", request_changes: "draft" },
  published: { supersede: "superseded" },
  superseded: {},
};

const reviewerRoles = new Set(["principal", "reviewer"]);

/**
 * Whether publishing this document requires a second person — decided on the
 * server from the document itself, never from a caller-supplied flag. The
 * `policySensitive` option on `transitionContent` can only *add* to this; it
 * can never turn it off, so a client cannot bypass two-person control by
 * omitting the flag.
 *
 * Canonical identity is always governance-sensitive: no single person may
 * change the Principal's name, title or biography unilaterally. Tagged signals
 * (positions and foresight) carry the same requirement. Broadening this to
 * arbitrary policy pages needs a per-document sensitivity marker and a product
 * decision on which pages qualify; that remains open (see the ledger).
 */
export function requiresIndependentApproval(version: ContentVersion): boolean {
  if (version.documentType === "identity") return true;
  if (version.documentType !== "signal") return false;
  const payload = version.payload;
  return Boolean(
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { tags?: unknown }).tags) &&
    (payload as { tags: unknown[] }).tags.length > 0,
  );
}

export function transitionContent(
  version: ContentVersion,
  action: WorkflowAction,
  actor: EditorialActor,
  options: Readonly<{ policySensitive?: boolean; scheduledFor?: Date }> = {},
): ContentVersion {
  const nextState = permittedTransitions[version.state][action];
  if (!nextState) {
    throw new Error(`Cannot ${action} content in ${version.state} state`);
  }

  if (action === "approve") {
    if (!actor.roles.some((role) => reviewerRoles.has(role))) {
      throw new Error("A reviewer role is required to approve content");
    }
    if (
      (options.policySensitive || requiresIndependentApproval(version)) &&
      actor.id === version.authorId
    ) {
      throw new Error("Policy-sensitive content requires a different approver");
    }
  }

  if (action === "schedule" && !options.scheduledFor) {
    throw new Error("Scheduled content requires a publication time");
  }

  const next: ContentVersion = {
    ...version,
    state: nextState,
    ...(action === "approve"
      ? { reviewerId: actor.id, approvedAt: new Date() }
      : {}),
    ...(action === "schedule" ? { scheduledFor: options.scheduledFor } : {}),
    ...(action === "approve" && requiresIndependentApproval(version)
      ? {
          payload: {
            ...(version.payload as Record<string, unknown>),
            approvedBy: actor.id,
          },
        }
      : {}),
  };

  return next;
}

export type Publication = Readonly<{
  documentType: ContentKind;
  documentId: string;
  locale: Locale;
  version: number;
  publishedAt: Date;
}>;

export type Unpublication = Readonly<{
  documentType: ContentKind;
  documentId: string;
  locale: Locale;
  version: number;
  unpublishedAt: Date;
}>;

export type AuditExport = Readonly<{
  format: "amanor-editorial-audit-v2";
  generatedAt: Date;
  documentType: ContentKind;
  documentId: string;
  events: readonly import("../application/audit").EditorialAuditEvent[];
  integrity: EditorialAuditIntegrity;
}>;

export type EditorialAuditIntegrity = Readonly<{
  status: "valid" | "invalid" | "incomplete";
  checkedEvents: number;
  headSequence?: number;
  reason?: string;
}>;

export function publicationTags(publication: Publication): readonly string[] {
  return [
    "content",
    `content:${publication.documentType}`,
    `content:${publication.documentType}:${publication.documentId}`,
    `locale:${publication.locale}`,
  ];
}
