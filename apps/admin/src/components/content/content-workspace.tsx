"use client";

import {
  contentKinds,
  workflowStates,
  type AuthSessionResponse,
  type AuditExport,
  type ContentKind,
  type ContentDocumentSummary,
  type ContentVersion,
  type EditorialAuditEvent,
  type EditorialAuditIntegrity,
  type SourceAuditReport,
  type WorkflowAction,
} from "@amanor/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  createContentDraft,
  exportContentAudit,
  getContentAuditIntegrity,
  getSourceAuditReport,
  listContentAudit,
  listContentDocuments,
  listContentVersions,
  publishContentVersion,
  rollbackContentVersion,
  transitionContentVersion,
  unpublishContent,
} from "../../lib/api/client";
import { PagePayloadEditor } from "./page-payload-editor";
import { SchemaPayloadEditor } from "./schema-payload-editor";
import { AdminSelect } from "../ui/admin-select";
import { AdminTemporalField } from "../ui/admin-temporal-field";
import {
  AdminEmptyState,
  AdminNotice,
  AdminSkeleton,
  BusyLabel,
} from "../ui/admin-state";

type AdminRole = AuthSessionResponse["user"]["roles"][number];

const authorRoles = new Set<AdminRole>([
  "principal",
  "desk_officer",
  "editor",
  "translator",
]);
const reviewerRoles = new Set<AdminRole>(["principal", "reviewer"]);

const labels: Record<ContentKind, string> = {
  identity: "Identity registry",
  atlasNode: "Atlas node",
  speakingTheme: "Speaking theme",
  signal: "Signal",
  archiveItem: "Archive item",
  source: "Source",
  scholar: "Scholar",
  officeHoursCycle: "Office Hours cycle",
  officeHoursAnswer: "Office Hours answer",
  selahEntry: "Selah entry",
  riderTemplate: "Rider template",
  emailTemplate: "Email template",
  page: "Website page",
  blackout: "Blackout",
  counterparty: "Counterparty",
  deskConfiguration: "Desk configuration",
};

const contentDescriptions: Record<ContentKind, string> = {
  page: "Website pages and their English and French sections",
  identity: "Official name, biographies, titles and approved portraits",
  atlasNode: "Places, roles, outcomes and proof points shown in the Atlas",
  speakingTheme: "Speaking topics, formats, history and related media",
  signal: "Short foresight notes and their publication details",
  archiveItem: "Speeches, interviews, transcripts and citations",
  source: "Evidence used to support public claims",
  scholar: "Consent-approved scholar profiles and support records",
  officeHoursCycle: "Office Hours dates, capacity and ballot settings",
  officeHoursAnswer: "Published questions and written answers",
  selahEntry: "Quiet reflections for the Selah page",
  riderTemplate: "Requirements sent with speaking engagements",
  emailTemplate: "Approved messages sent by the platform",
  blackout: "Dates that cannot accept speaking requests",
  counterparty: "Organisations involved in requests and engagements",
  deskConfiguration: "Protocol Desk rules and response settings",
};

const stateActions: Readonly<
  Record<ContentVersion["state"], readonly WorkflowAction[]>
> = {
  draft: ["submit"],
  in_review: ["request_changes", "approve"],
  approved: ["request_changes", "schedule"],
  scheduled: ["request_changes"],
  published: ["supersede"],
  superseded: [],
};

/** Plain words for the workflow states, used on every library row. */
const stateLabels: Record<ContentVersion["state"], string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  superseded: "Superseded",
};

/**
 * The one sentence an operator needs when Publish is not available: what has to
 * happen next, and who has to do it. Naming the role matters more than naming
 * the state, because the usual reason work stalls is that it is waiting on
 * somebody else.
 */
function publicationBlocker({
  state,
  canAuthor,
  canReview,
  policyReviewRequired,
  scheduledFor,
}: Readonly<{
  state: ContentVersion["state"];
  canAuthor: boolean;
  canReview: boolean;
  policyReviewRequired: boolean;
  scheduledFor: string;
}>): string {
  if (state === "draft")
    return canAuthor
      ? "This is a draft. Submit it for review to start the approval it needs before publishing."
      : "This is a draft. An editor or translator has to submit it for review before it can be approved.";
  if (state === "in_review")
    return canReview
      ? policyReviewRequired
        ? "Waiting on you to approve it. Its Signal policy tags mean this approval is an independent review."
        : "Waiting on you to approve it before it can be published."
      : "Waiting on a reviewer to approve it. Nobody can publish it until they do.";
  if (state === "approved")
    return canReview
      ? scheduledFor
        ? "Approved. Schedule it for the time you chose, or publish one language now."
        : "Approved and ready. Publish English or French now, or set a publication time to schedule it."
      : "Approved and waiting on a reviewer to publish it.";
  if (state === "scheduled")
    return "Scheduled. It publishes on its own at the chosen time; request changes to stop it.";
  if (state === "published")
    return "Live on the public website. Supersede it to start the next version, or take a language down.";
  return "Superseded by a newer version. Open the latest version to make further changes.";
}

const actionLabels: Record<WorkflowAction, string> = {
  submit: "Submit for review",
  request_changes: "Request changes",
  approve: "Approve",
  schedule: "Schedule",
  supersede: "Supersede",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneEmpty);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== "")
      .map(([key, item]) => [key, pruneEmpty(item)]),
  );
}

function operationMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const reference = error.requestId
      ? ` Support reference: ${error.requestId}.`
      : "";
    if (error.status === 401)
      return `Your session has expired. Sign in again, then reopen this content.${reference}`;
    if (error.status === 403)
      return `Your account does not have permission to complete this action. Ask an administrator to review your role.${reference}`;
    if (error.status === 404)
      return `This content could not be found. Browse the available content and open it again.${reference}`;
    if (error.status === 409)
      return `Someone else changed this content while you were editing. Reopen the latest version before trying again.${reference}`;
    if (error.status === 429)
      return `Too many requests were sent in a short time. Wait a moment, then try again.${reference}`;
    if (error.status >= 500)
      return `The content service is temporarily unavailable. Your changes remain in this browser; wait a moment and try again.${reference}`;
    return `${error.message}${reference}`;
  }

  if (error instanceof TypeError)
    return "The editor could not connect to the content service. Your changes remain in this browser. Check your connection, then try again.";

  if (
    error instanceof Error &&
    (error.name === "ZodError" || /invalid.*response/iu.test(error.message))
  )
    return "The saved content is in a format this editor cannot read. Nothing was changed. Reopen the item; if the problem continues, share the page name with support.";

  if (
    error instanceof Error &&
    error.message === "Payload must be a JSON object"
  )
    return "The advanced content must be one JSON object. Correct the value, then save the draft again.";

  return "Something unexpected stopped this action. Your changes remain in this browser. Reopen the content and try again.";
}

function replaceVersion(
  versions: readonly ContentVersion[],
  next: ContentVersion,
) {
  return versions.map((version) =>
    version.version === next.version ? next : version,
  );
}

function isTaggedSignal(documentType: ContentKind, payload: unknown): boolean {
  return (
    documentType === "signal" &&
    isRecord(payload) &&
    Array.isArray(payload.tags) &&
    payload.tags.length > 0
  );
}

function previewText(value: unknown, locale: "en-GB" | "fr-FR"): string {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value[locale] === "string")
    return value[locale];
  return "";
}

function ContentPreview({
  payload,
  locale,
  label,
}: Readonly<{
  payload: unknown;
  locale: "en-GB" | "fr-FR";
  label: string;
}>) {
  if (!isRecord(payload)) return null;
  const title = previewText(payload.title, locale) || label;
  const summary = previewText(payload.summary, locale);
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  return (
    <section className="content-preview" aria-label={`${label} preview`}>
      <header>
        <p className="section-context">
          Preview · {locale === "en-GB" ? "English" : "French"}
        </p>
        <h3>{title}</h3>
        {summary ? <p>{summary}</p> : null}
      </header>
      {sections.length ? (
        <div className="content-preview__sections">
          {sections.slice(0, 8).map((section, index) => {
            const record = isRecord(section) ? section : {};
            const heading =
              previewText(record.heading, locale) || `Section ${index + 1}`;
            const body = previewText(record.body, locale);
            return (
              <article key={`${heading}-${index}`}>
                <strong>{heading}</strong>
                {body ? (
                  <p>{body}</p>
                ) : (
                  <small>
                    No {locale === "en-GB" ? "English" : "French"} body text
                    yet.
                  </small>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <dl className="content-preview__fields">
          {Object.entries(payload)
            .slice(0, 12)
            .map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt>
                <dd>
                  {previewText(value, locale) ||
                    (typeof value === "number" ? value : "Not set")}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </section>
  );
}

export function ContentWorkspace({
  roles,
}: Readonly<{ roles: readonly AdminRole[] }>) {
  const canAuthor = roles.some((role) => authorRoles.has(role));
  const canReview = roles.some((role) => reviewerRoles.has(role));
  const canAuditSources = roles.some((role) =>
    ["principal", "editor", "reviewer"].includes(role),
  );
  const [documentType, setDocumentType] = useState<ContentKind>("page");
  const [documentId, setDocumentId] = useState("home");
  const [versions, setVersions] = useState<readonly ContentVersion[]>([]);
  const [documents, setDocuments] = useState<readonly ContentDocumentSummary[]>(
    [],
  );
  const [documentsCursor, setDocumentsCursor] = useState<string | undefined>();
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [editorValue, setEditorValue] = useState("{}\n");
  const [editorMode, setEditorMode] = useState<"structured" | "json">(
    "structured",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [policySensitive, setPolicySensitive] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [publishLocale, setPublishLocale] = useState<"en-GB" | "fr-FR">(
    "en-GB",
  );
  const [audit, setAudit] = useState<readonly EditorialAuditEvent[] | null>(
    null,
  );
  const [auditExport, setAuditExport] = useState<AuditExport | null>(null);
  const [auditIntegrity, setAuditIntegrity] =
    useState<EditorialAuditIntegrity | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [sourceAudit, setSourceAudit] = useState<SourceAuditReport | null>(
    null,
  );
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  // The library loads in the background and must never disable the editor, so
  // it carries its own pending and failure state rather than the shared `busy`.
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryState, setLibraryState] = useState<
    "all" | ContentVersion["state"]
  >("all");

  // The library filters what has been loaded rather than asking the API to
  // filter, so the count below always says which of the loaded records are on
  // screen and an operator is never told a page is empty when it is only
  // filtered.
  const visibleDocuments = useMemo(() => {
    const needle = libraryQuery.trim().toLocaleLowerCase();
    return documents.filter(
      (document) =>
        (libraryState === "all" || document.state === libraryState) &&
        (!needle || document.documentId.toLocaleLowerCase().includes(needle)),
    );
  }, [documents, libraryQuery, libraryState]);

  // Nothing is discoverable behind a button an operator has to know to press,
  // so the library for the chosen type loads on arrival and on every change of
  // type. It stays quiet: the message line is for actions the operator took.
  useEffect(() => {
    void browseDocuments();
    // browseDocuments closes over documentType, which is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType]);

  const selected =
    versions.find((version) => version.version === selectedVersion) ?? null;
  const policyReviewRequired = isTaggedSignal(documentType, selected?.payload);

  function resetFeedback(operation: string) {
    setBusy(operation);
    setMessage(null);
    setError(null);
    setHasConflict(false);
  }

  async function browseDocuments(cursor?: string) {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const page = await listContentDocuments(documentType, cursor);
      // Read the page here rather than inside the updater: React runs an
      // updater during a later render, where a throw escapes this catch and
      // takes the whole workspace down instead of showing the list error.
      const items = page.items;
      setDocuments((current) => (cursor ? [...current, ...items] : items));
      setDocumentsCursor(page.nextCursor);
    } catch (caught) {
      setLibraryError(operationMessage(caught));
    } finally {
      setLibraryLoading(false);
    }
  }

  async function downloadSourceAudit() {
    resetFeedback("source-audit");
    try {
      const report = await getSourceAuditReport();
      setSourceAudit(report);
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `amanor-source-audit-${report.generatedAt.toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Complete Source Register and claim audit downloaded.");
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function openDocument(targetDocumentId = documentId) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(targetDocumentId)) {
      setError(
        "Document ID must use letters, numbers, hyphens or underscores.",
      );
      return;
    }
    resetFeedback("open");
    setDocumentId(targetDocumentId);
    setAudit(null);
    setAuditExport(null);
    try {
      const loaded = await listContentVersions(documentType, targetDocumentId);
      setVersions(loaded);
      const latest = loaded[0] ?? null;
      setSelectedVersion(latest?.version ?? null);
      if (latest && isRecord(latest.payload))
        setEditorValue(`${JSON.stringify(latest.payload, null, 2)}\n`);
      setMessage(
        latest
          ? `Loaded ${loaded.length} immutable version${loaded.length === 1 ? "" : "s"}.`
          : "No versions exist yet. Create the first draft.",
      );
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function createDraft() {
    resetFeedback("draft");
    try {
      const parsed: unknown = JSON.parse(editorValue);
      if (!isRecord(parsed)) throw new Error("Payload must be a JSON object");
      const payload = editorMode === "structured" ? pruneEmpty(parsed) : parsed;
      if (!isRecord(payload)) throw new Error("Payload must be a JSON object");
      const created = await createContentDraft(
        documentType,
        documentId,
        payload,
      );
      setVersions((current) => [created, ...current]);
      setSelectedVersion(created.version);
      setMessage(`Draft version ${created.version} created.`);
    } catch (caught) {
      setError(
        caught instanceof SyntaxError
          ? "The draft is not valid JSON."
          : operationMessage(caught),
      );
    } finally {
      setBusy(null);
    }
  }

  async function transition(action: WorkflowAction) {
    if (!selected) return;
    resetFeedback(action);
    try {
      const next = await transitionContentVersion({
        documentType,
        documentId,
        version: selected.version,
        action,
        ...(action === "approve"
          ? { policySensitive: policyReviewRequired || policySensitive }
          : {}),
        ...(action === "schedule" && scheduledFor
          ? { scheduledFor: new Date(scheduledFor).toISOString() }
          : {}),
      });
      setVersions((current) => replaceVersion(current, next));
      setMessage(
        `Version ${next.version} is now ${next.state.replace("_", " ")}.`,
      );
    } catch (caught) {
      if (
        caught instanceof ApiClientError &&
        /changed concurrently/iu.test(caught.message)
      ) {
        setHasConflict(true);
      }
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!selected) return;
    resetFeedback("publish");
    try {
      const publication = await publishContentVersion({
        documentType,
        documentId,
        version: selected.version,
        locale: publishLocale,
      });
      setVersions((current) =>
        replaceVersion(current, { ...selected, state: "published" }),
      );
      setMessage(
        `Version ${publication.version} published for ${publication.locale}. Revalidation is queued.`,
      );
      setPublishReviewOpen(false);
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function loadAudit() {
    resetFeedback("audit");
    try {
      const [events, integrity] = await Promise.all([
        listContentAudit(documentType, documentId, 100),
        getContentAuditIntegrity(documentType, documentId),
      ]);
      setAudit(events);
      setAuditIntegrity(integrity);
      setMessage(
        `Loaded ${events.length} audit event${events.length === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function prepareAuditExport() {
    resetFeedback("audit-export");
    try {
      const exported = await exportContentAudit(documentType, documentId);
      setAuditExport(exported);
      setAuditIntegrity(exported.integrity);
      setMessage(
        `Prepared ${exported.events.length} audit events for download.`,
      );
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function rollback() {
    if (!selected) return;
    resetFeedback("rollback");
    try {
      const publication = await rollbackContentVersion({
        documentType,
        documentId,
        version: selected.version,
        locale: publishLocale,
      });
      setVersions((current) =>
        current.map((version) => ({
          ...version,
          state:
            version.version === publication.version
              ? "published"
              : version.state === "published"
                ? "superseded"
                : version.state,
        })),
      );
      setMessage(
        `Restored version ${publication.version} for ${publication.locale}. Revalidation is queued.`,
      );
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function unpublish() {
    resetFeedback("unpublish");
    try {
      const result = await unpublishContent({
        documentType,
        documentId,
        locale: publishLocale,
      });
      setVersions(await listContentVersions(documentType, documentId));
      setConfirmUnpublish(false);
      setMessage(
        `${result.locale} publication removed. Revalidation is queued and the takedown is audited.`,
      );
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const availableActions = selected ? stateActions[selected.state] : [];

  return (
    <div className="content-workspace">
      <header className="cms-welcome">
        <div>
          <p className="section-context">Website editor</p>
          <h2>Update what visitors see</h2>
          <p>
            Choose a page or content item, edit its current wording, preview it,
            then save it for review.
          </p>
        </div>
        <ol aria-label="How publishing works">
          <li>
            <span>1</span>
            <strong>Choose</strong>
            <small>Open existing content</small>
          </li>
          <li>
            <span>2</span>
            <strong>Edit</strong>
            <small>Update and preview</small>
          </li>
          <li>
            <span>3</span>
            <strong>Review</strong>
            <small>Approve before publishing</small>
          </li>
        </ol>
      </header>
      <section
        className="document-locator content-command"
        aria-labelledby="document-locator-title"
      >
        <div>
          <p className="section-context">Step 1 · Choose content</p>
          <h2 id="document-locator-title">What do you want to update?</h2>
          <p className="content-command__intro">
            Start with Website page for normal page wording. The other options
            manage reusable information shown across the website.
          </p>
        </div>
        <div className="document-locator__fields">
          <div className="field">
            <AdminSelect
              label="What kind of content?"
              value={documentType}
              onChange={(event) => {
                setDocumentType(event.target.value as ContentKind);
                setDocuments([]);
                setDocumentsCursor(undefined);
                setVersions([]);
                setSelectedVersion(null);
                setEditorValue("{}\n");
                setAudit(null);
              }}
            >
              {contentKinds.map((kind) => (
                <option value={kind} key={kind}>
                  {labels[kind]}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div className="field">
            <label htmlFor="library-search">Search by name</label>
            <input
              id="library-search"
              type="search"
              value={libraryQuery}
              placeholder={`Filter ${labels[documentType].toLowerCase()}s`}
              onChange={(event) => setLibraryQuery(event.target.value)}
              maxLength={128}
            />
          </div>
          <div className="field">
            <AdminSelect
              label="Status"
              value={libraryState}
              onChange={(event) =>
                setLibraryState(
                  event.target.value as "all" | ContentVersion["state"],
                )
              }
            >
              <option value="all">Every status</option>
              {workflowStates.map((state) => (
                <option value={state} key={state}>
                  {stateLabels[state]}
                </option>
              ))}
            </AdminSelect>
          </div>
          {canAuditSources ? (
            <div className="document-locator__utility">
              <span>Evidence and compliance</span>
              <button
                className="text-button"
                type="button"
                onClick={() => void downloadSourceAudit()}
                disabled={busy !== null}
              >
                {busy === "source-audit" ? (
                  <BusyLabel label="Auditing sources" />
                ) : (
                  "Download source audit"
                )}
              </button>
            </div>
          ) : null}
        </div>
        <p className="content-type-help">
          <strong>{labels[documentType]}:</strong>{" "}
          {contentDescriptions[documentType]}
        </p>
        {sourceAudit ? (
          <p role="status">
            {sourceAudit.totals.sourceEntries} sources ·{" "}
            {sourceAudit.totals.claimReferences} claim references ·{" "}
            {sourceAudit.totals.missingReferences} missing ·{" "}
            {sourceAudit.totals.unusedSources} unused
          </p>
        ) : null}
      </section>

      <section
        className="record-browser"
        aria-labelledby="record-browser-title"
      >
        <div className="record-browser__heading">
          <div>
            <p className="section-context">Available content</p>
            <h2 id="record-browser-title">
              Choose a {labels[documentType].toLowerCase()}
            </h2>
          </div>
          <p className="record-browser__count">
            {visibleDocuments.length}{" "}
            {visibleDocuments.length === 1 ? "item" : "items"}
            {documents.length === visibleDocuments.length
              ? ""
              : ` of ${documents.length}`}
            {documentsCursor ? " loaded so far" : ""}
          </p>
        </div>

        {libraryLoading && documents.length === 0 ? (
          <AdminSkeleton variant="content" label="Loading content records" />
        ) : visibleDocuments.length > 0 ? (
          <div className="record-list">
            {visibleDocuments.map((document) => (
              <button
                type="button"
                key={document.documentId}
                aria-current={
                  document.documentId === documentId && versions.length > 0
                    ? "true"
                    : undefined
                }
                aria-label={`Select ${document.documentId}, version ${document.latestVersion}, ${document.state.replace("_", " ")}`}
                onClick={() => {
                  void openDocument(document.documentId);
                }}
              >
                <strong>{document.documentId}</strong>
                <span className="record-list__meta">
                  <span className="record-state" data-state={document.state}>
                    {stateLabels[document.state]}
                  </span>
                  <span>v{document.latestVersion}</span>
                  <time dateTime={document.updatedAt.toISOString()}>
                    {document.updatedAt.toLocaleDateString()}
                  </time>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            kind="content"
            title={
              documents.length
                ? "Nothing matches these filters"
                : `No ${labels[documentType].toLowerCase()} records yet`
            }
            description={
              documents.length
                ? "Clear the search or choose Every status to see the rest of this library."
                : `Nothing of this type has been created. Name it below and open it to write the first draft.`
            }
          />
        )}

        {libraryLoading && documents.length > 0 ? (
          <AdminSkeleton variant="rows" label="Loading more records" />
        ) : null}
        {libraryError ? (
          <AdminNotice
            tone="error"
            title="This content list could not be loaded"
            description={libraryError}
            action={
              <button
                className="secondary-button"
                type="button"
                onClick={() => void browseDocuments()}
              >
                Try again
              </button>
            }
          />
        ) : null}
        {documentsCursor ? (
          <button
            className="text-button"
            type="button"
            disabled={libraryLoading}
            onClick={() => void browseDocuments(documentsCursor)}
          >
            Load more
          </button>
        ) : null}

        {/* The library covers everything that exists; this opens something
            that does not yet, which is how a first draft gets created. It
            stays visible rather than folding into a disclosure, because the
            control that creates content should not itself be hidden. */}
        <div className="record-browser__by-name">
          <p>Not in the list? Name it here to open or start it.</p>
          <div className="document-locator__fields">
            <div className="field">
              <label htmlFor="documentId">Page or item name</label>
              <input
                id="documentId"
                aria-label="Document ID"
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
                maxLength={128}
              />
            </div>
            <button
              className="primary-button"
              type="button"
              aria-label="Open document"
              onClick={() => void openDocument()}
              disabled={busy !== null}
            >
              {busy === "open" ? (
                <BusyLabel label="Opening document" />
              ) : (
                "Open and edit"
              )}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="cms-feedback cms-feedback--error" role="alert">
          <p>{error}</p>
          {hasConflict ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void openDocument()}
              disabled={busy !== null}
            >
              Reload latest version
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p className="cms-feedback" aria-live="polite">
          {message}
        </p>
      ) : null}

      <div className="editor-layout">
        <section className="payload-editor" aria-labelledby="payload-title">
          <div className="editor-heading">
            <div>
              <p className="section-context">Step 2 · Edit and preview</p>
              <h2 id="payload-title">
                {selected
                  ? `Edit ${documentId}`
                  : `Create a ${labels[documentType].toLowerCase()}`}
              </h2>
              <p>
                {selected
                  ? `You are editing version ${selected.version}, currently ${selected.state.replaceAll("_", " ")}. Saving creates a new version; it does not publish immediately.`
                  : "Open existing content above. If this item does not exist yet, initialise a blank form and complete the fields."}
              </p>
            </div>
            <div className="editor-heading__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDraftPreviewOpen((open) => !open)}
              >
                {draftPreviewOpen ? "Hide preview" : "Preview changes"}
              </button>
              {canAuthor ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void createDraft()}
                  disabled={busy !== null}
                >
                  {busy === "draft" ? (
                    <BusyLabel label="Creating draft" />
                  ) : (
                    "Save as new draft"
                  )}
                </button>
              ) : null}
            </div>
          </div>
          <div className="editor-mode" aria-label="Editor mode">
            <button
              type="button"
              aria-pressed={editorMode === "structured"}
              onClick={() => setEditorMode("structured")}
            >
              Editing form
            </button>
            <button
              type="button"
              aria-pressed={editorMode === "json"}
              onClick={() => setEditorMode("json")}
            >
              Advanced JSON
            </button>
          </div>
          {editorMode === "structured" ? (
            documentType === "page" ? (
              <PagePayloadEditor
                rawValue={editorValue}
                onChange={setEditorValue}
                readOnly={!canAuthor}
              />
            ) : (
              <SchemaPayloadEditor
                kind={documentType}
                rawValue={editorValue}
                onChange={setEditorValue}
                readOnly={!canAuthor}
              />
            )
          ) : (
            <>
              <label className="sr-only" htmlFor="payload">
                Draft payload as JSON
              </label>
              <textarea
                id="payload"
                value={editorValue}
                onChange={(event) => setEditorValue(event.target.value)}
                readOnly={!canAuthor}
                spellCheck={false}
              />
            </>
          )}
          {draftPreviewOpen
            ? (() => {
                try {
                  return (
                    <ContentPreview
                      payload={JSON.parse(editorValue) as unknown}
                      locale={publishLocale}
                      label={labels[documentType]}
                    />
                  );
                } catch {
                  return (
                    <p className="form-error" role="alert">
                      The preview cannot open until the JSON is valid.
                    </p>
                  );
                }
              })()
            : null}
          <p className="editor-help">
            Your changes are checked before they are saved. Saving creates a new
            draft and leaves the current public content unchanged.
          </p>
        </section>
      </div>

      <section className="version-panel" aria-labelledby="versions-title">
        <div className="version-heading">
          <div>
            <p className="section-context">Saved history</p>
            <h2 id="versions-title">Previous versions</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => void loadAudit()}
            disabled={busy !== null}
          >
            Audit trail
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => void prepareAuditExport()}
            disabled={busy !== null}
          >
            {busy === "audit-export" ? (
              <BusyLabel label="Preparing audit" />
            ) : (
              "Export audit"
            )}
          </button>
        </div>
        {versions.length === 0 ? (
          <AdminEmptyState
            kind="history"
            title="No version selected"
            description="Open a record to reveal its immutable history, review state and publication path."
          />
        ) : (
          <div className="version-list">
            {versions.map((version) => (
              <button
                type="button"
                key={version.version}
                aria-current={
                  version.version === selectedVersion ? "true" : undefined
                }
                onClick={() => {
                  setSelectedVersion(version.version);
                  if (isRecord(version.payload))
                    setEditorValue(
                      `${JSON.stringify(version.payload, null, 2)}\n`,
                    );
                }}
              >
                <strong>Version {version.version}</strong>
                <span>{version.state.replace("_", " ")}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <section className="workflow-panel" aria-labelledby="workflow-title">
          <div>
            <p className="section-context">Step 3 · Review and publish</p>
            <h2 id="workflow-title">Review and publishing</h2>
            <p>
              Version {selected.version} is{" "}
              <strong>{selected.state.replace("_", " ")}</strong>. Only the
              actions available at this stage are shown.
            </p>
            <p className="workflow-blocker" role="status">
              {publicationBlocker({
                state: selected.state,
                canAuthor,
                canReview,
                policyReviewRequired,
                scheduledFor,
              })}
            </p>
          </div>
          <div className="workflow-controls">
            {availableActions.includes("approve") && canReview ? (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={policyReviewRequired || policySensitive}
                  disabled={policyReviewRequired}
                  onChange={(event) => setPolicySensitive(event.target.checked)}
                />{" "}
                {policyReviewRequired
                  ? "Independent review required by Signal policy tags"
                  : "Policy-sensitive content"}
              </label>
            ) : null}
            {availableActions.includes("schedule") && canReview ? (
              <div className="field">
                <AdminTemporalField
                  label="Publication time"
                  value={scheduledFor}
                  onValueChange={setScheduledFor}
                />
              </div>
            ) : null}
            <div className="workflow-actions">
              {availableActions.map((action) => {
                const permitted =
                  action === "submit" || action === "supersede"
                    ? canAuthor
                    : canReview;
                if (!permitted) return null;
                return (
                  <button
                    className="secondary-button"
                    type="button"
                    key={action}
                    disabled={
                      busy !== null || (action === "schedule" && !scheduledFor)
                    }
                    onClick={() => void transition(action)}
                  >
                    {busy === action ? (
                      <BusyLabel label={`Applying ${actionLabels[action]}`} />
                    ) : (
                      actionLabels[action]
                    )}
                  </button>
                );
              })}
            </div>
            {(selected.state === "approved" ||
              selected.state === "scheduled") &&
            canReview ? (
              <div className="publish-controls">
                <div className="field">
                  <AdminSelect
                    label="Publish locale"
                    value={publishLocale}
                    onChange={(event) =>
                      setPublishLocale(event.target.value as "en-GB" | "fr-FR")
                    }
                  >
                    <option value="en-GB">English</option>
                    <option value="fr-FR">French</option>
                  </AdminSelect>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setPublishReviewOpen(true)}
                  disabled={busy !== null}
                >
                  Review before publishing
                </button>
              </div>
            ) : null}
            {publishReviewOpen &&
            (selected.state === "approved" || selected.state === "scheduled") &&
            canReview ? (
              <div className="publish-review">
                <ContentPreview
                  payload={selected.payload}
                  locale={publishLocale}
                  label={labels[documentType]}
                />
                <div className="publish-review__actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setPublishReviewOpen(false)}
                  >
                    Back to editing
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void publish()}
                    disabled={busy !== null}
                  >
                    {busy === "publish" ? (
                      <BusyLabel label="Publishing" />
                    ) : (
                      `Publish ${publishLocale === "en-GB" ? "English" : "French"}`
                    )}
                  </button>
                </div>
              </div>
            ) : null}
            {(selected.state === "superseded" ||
              selected.state === "published") &&
            canReview ? (
              <div className="publish-controls">
                <div className="field">
                  <AdminSelect
                    label="Restore locale"
                    value={publishLocale}
                    onChange={(event) =>
                      setPublishLocale(event.target.value as "en-GB" | "fr-FR")
                    }
                  >
                    <option value="en-GB">English</option>
                    <option value="fr-FR">French</option>
                  </AdminSelect>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void rollback()}
                  disabled={busy !== null}
                >
                  {busy === "rollback" ? (
                    <BusyLabel label="Restoring version" />
                  ) : (
                    "Restore this version"
                  )}
                </button>
              </div>
            ) : null}
            {selected.state === "published" && canReview ? (
              <div className="publish-controls">
                <div className="field">
                  <AdminSelect
                    label="Takedown locale"
                    value={publishLocale}
                    onChange={(event) => {
                      setConfirmUnpublish(false);
                      setPublishLocale(event.target.value as "en-GB" | "fr-FR");
                    }}
                  >
                    <option value="en-GB">English</option>
                    <option value="fr-FR">French</option>
                  </AdminSelect>
                </div>
                {confirmUnpublish ? (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void unpublish()}
                    disabled={busy !== null}
                  >
                    {busy === "unpublish" ? (
                      <BusyLabel label="Removing publication" />
                    ) : (
                      `Confirm ${publishLocale} takedown`
                    )}
                  </button>
                ) : (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => setConfirmUnpublish(true)}
                    disabled={busy !== null}
                  >
                    Prepare unpublish
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {audit ? (
        <section className="audit-panel" aria-labelledby="audit-title">
          <h2 id="audit-title">Audit trail</h2>
          {auditIntegrity ? (
            <p
              className="empty-copy"
              role={auditIntegrity.status === "valid" ? "status" : "alert"}
            >
              Chain {auditIntegrity.status}: {auditIntegrity.checkedEvents}{" "}
              event{auditIntegrity.checkedEvents === 1 ? "" : "s"} verified.
              {auditIntegrity.reason ? ` ${auditIntegrity.reason}` : ""}
            </p>
          ) : null}
          {audit.length === 0 ? (
            <AdminEmptyState
              kind="audit"
              title="No audit events yet"
              description="Events will appear here when this record enters the governed editorial workflow."
            />
          ) : (
            <ol>
              {audit.map((event) => (
                <li key={event.eventId}>
                  <div>
                    <strong>{event.action}</strong>
                    <span>{event.actorId}</span>
                  </div>
                  <time dateTime={event.occurredAt.toISOString()}>
                    {event.occurredAt.toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </time>
                  <code>{event.eventHash}</code>
                  {event.changes.length > 0 ? (
                    <details>
                      <summary>
                        {event.changes.length} recorded change
                        {event.changes.length === 1 ? "" : "s"}
                      </summary>
                      <ul>
                        {event.changes.map((change, index) => (
                          <li key={`${change.path}-${index}`}>
                            <code>{change.path}</code>
                            <span>
                              {JSON.stringify(change.before) ?? "not present"}
                              {" → "}
                              {JSON.stringify(change.after) ?? "not present"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {auditExport ? (
        <a
          className="audit-download"
          download={`${documentType}-${documentId}-audit.json`}
          href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(auditExport, null, 2))}`}
        >
          Download signed-chain audit JSON
        </a>
      ) : null}
    </div>
  );
}
