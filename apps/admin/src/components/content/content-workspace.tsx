"use client";

import {
  contentKinds,
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
import { useState } from "react";
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
import { AdminEmptyState, AdminSkeleton, LoadingDots } from "../ui/admin-state";

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
  page: "Page",
  blackout: "Blackout",
  counterparty: "Counterparty",
  deskConfiguration: "Desk configuration",
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

function operationMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return "The CMS operation failed. Reload the document and try again.";
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
    resetFeedback("browse");
    try {
      const page = await listContentDocuments(documentType, cursor);
      setDocuments((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      setDocumentsCursor(page.nextCursor);
      setMessage(
        page.items.length === 0
          ? "No records exist for this content type yet."
          : `Loaded ${page.items.length} record${page.items.length === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      setError(operationMessage(caught));
    } finally {
      setBusy(null);
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

  async function openDocument() {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(documentId)) {
      setError(
        "Document ID must use letters, numbers, hyphens or underscores.",
      );
      return;
    }
    resetFeedback("open");
    setAudit(null);
    setAuditExport(null);
    try {
      const loaded = await listContentVersions(documentType, documentId);
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
      <section
        className="document-locator content-command"
        aria-labelledby="document-locator-title"
      >
        <div>
          <p className="section-context">Content command / 01</p>
          <h2 id="document-locator-title">
            Find the record. Shape the release.
          </h2>
          <p className="content-command__intro">
            Locate one governed document or browse its collection. Every change
            remains versioned, reviewable and bilingual.
          </p>
        </div>
        <div className="document-locator__fields">
          <div className="field">
            <AdminSelect
              label="Content type"
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
            <label htmlFor="documentId">Document ID</label>
            <input
              id="documentId"
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              maxLength={128}
            />
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void openDocument()}
            disabled={busy !== null}
          >
            {busy === "open" ? (
              <LoadingDots label="Opening document" />
            ) : (
              "Open document"
            )}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => void browseDocuments()}
            disabled={busy !== null}
          >
            {busy === "browse" ? (
              <LoadingDots label="Loading records" />
            ) : (
              "Browse records"
            )}
          </button>
          {canAuditSources ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void downloadSourceAudit()}
              disabled={busy !== null}
            >
              {busy === "source-audit" ? (
                <LoadingDots label="Auditing sources" />
              ) : (
                "Download source audit"
              )}
            </button>
          ) : null}
        </div>
        {sourceAudit ? (
          <p role="status">
            {sourceAudit.totals.sourceEntries} sources ·{" "}
            {sourceAudit.totals.claimReferences} claim references ·{" "}
            {sourceAudit.totals.missingReferences} missing ·{" "}
            {sourceAudit.totals.unusedSources} unused
          </p>
        ) : null}
      </section>

      {busy === "browse" && documents.length === 0 ? (
        <AdminSkeleton variant="content" label="Loading content records" />
      ) : null}

      {documents.length > 0 ? (
        <section
          className="record-browser"
          aria-labelledby="record-browser-title"
        >
          <div className="record-browser__heading">
            <h2 id="record-browser-title">{labels[documentType]} records</h2>
            {documentsCursor ? (
              <button
                className="text-button"
                type="button"
                disabled={busy !== null}
                onClick={() => void browseDocuments(documentsCursor)}
              >
                {busy === "browse" ? (
                  <LoadingDots label="Loading more records" />
                ) : (
                  "Load more"
                )}
              </button>
            ) : null}
          </div>
          <div className="record-list">
            {documents.map((document) => (
              <button
                type="button"
                key={document.documentId}
                aria-label={`Select ${document.documentId}, version ${document.latestVersion}, ${document.state.replace("_", " ")}`}
                onClick={() => {
                  setDocumentId(document.documentId);
                  setVersions([]);
                  setSelectedVersion(null);
                  setMessage(
                    `Selected ${document.documentId}. Open it to load version history.`,
                  );
                }}
              >
                <strong>{document.documentId}</strong>
                <span>
                  v{document.latestVersion} · {document.state.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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
              <p className="section-context">Validated by NestJS</p>
              <h2 id="payload-title">Draft payload</h2>
            </div>
            {canAuthor ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => void createDraft()}
                disabled={busy !== null}
              >
                {busy === "draft" ? (
                  <LoadingDots label="Creating draft" />
                ) : (
                  "Create draft"
                )}
              </button>
            ) : null}
          </div>
          <div className="editor-mode" aria-label="Editor mode">
            <button
              type="button"
              aria-pressed={editorMode === "structured"}
              onClick={() => setEditorMode("structured")}
            >
              Structured fields
            </button>
            <button
              type="button"
              aria-pressed={editorMode === "json"}
              onClick={() => setEditorMode("json")}
            >
              JSON
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
          <p className="editor-help">
            Immutable versions are validated against the selected content
            schema. Internal validation errors never create a partial draft.
          </p>
        </section>
      </div>

      <section className="version-panel" aria-labelledby="versions-title">
        <div className="version-heading">
          <h2 id="versions-title">Versions</h2>
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
              <LoadingDots label="Preparing audit" />
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
            <p className="section-context">
              Immutable version {selected.version}
            </p>
            <h2 id="workflow-title">Workflow</h2>
            <p>
              Current state: <strong>{selected.state.replace("_", " ")}</strong>
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
                      <LoadingDots label={`Applying ${actionLabels[action]}`} />
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
                  onClick={() => void publish()}
                  disabled={busy !== null}
                >
                  {busy === "publish" ? (
                    <LoadingDots label="Publishing" />
                  ) : (
                    "Publish"
                  )}
                </button>
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
                    <LoadingDots label="Restoring version" />
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
                      <LoadingDots label="Removing publication" />
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
