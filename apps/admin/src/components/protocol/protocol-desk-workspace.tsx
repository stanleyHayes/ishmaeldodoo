"use client";

import type {
  AuthSessionResponse,
  ProtocolDeskQueueItem,
  ProtocolDeskQueueQuery,
  ProtocolDeskRequestDetail,
  ProtocolDeskOperations,
  ProtocolDeskAvailability,
  ProtocolDeskTransitionInput,
  ProtocolNoteInput,
} from "@amanor/contracts";
import { useEffect, useState } from "react";
import {
  addProtocolDeskNote,
  assignProtocolDeskRequest,
  clearProtocolDeskFlag,
  configureProtocolNote,
  getProtocolDeskRequest,
  generateProtocolNote,
  getProtocolDeskOperations,
  checkProtocolDeskAvailability,
  listProtocolDeskQueue,
  retryProtocolDeskCorrespondence,
  retryProtocolDeskCalendarSync,
  retryPrincipalDecisionDelivery,
  transitionProtocolDeskRequest,
} from "../../lib/api/client";

const states = [
  "",
  "received",
  "screened",
  "awaiting_decision",
  "info_requested",
  "held",
  "accepted",
  "declined",
  "lapsed",
] as const;
const transitionLabels: Readonly<
  Record<ProtocolDeskTransitionInput["state"], string>
> = {
  received: "Received",
  screened: "Screened",
  awaiting_decision: "Awaiting decision",
  info_requested: "Information requested",
  held: "Held",
  accepted: "Accepted",
  contracted: "Contracted",
  delivered: "Delivered",
  declined: "Declined",
  lapsed: "Lapsed",
  archived: "Archived",
};
const flags = [
  "",
  "conflict",
  "lead_time",
  "unverified",
  "clash",
  "sensitivity",
  "repeat_requester",
] as const;

export function ProtocolDeskWorkspace({
  roles,
}: Readonly<{ roles: AuthSessionResponse["user"]["roles"] }>) {
  const [items, setItems] = useState<readonly ProtocolDeskQueueItem[]>([]);
  const [filters, setFilters] = useState<Partial<ProtocolDeskQueueQuery>>({});
  const [nextCursor, setNextCursor] = useState<string>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [detail, setDetail] = useState<ProtocolDeskRequestDetail>();
  const [actionError, setActionError] = useState<string>();
  const [operations, setOperations] = useState<ProtocolDeskOperations>();
  const [availability, setAvailability] = useState<ProtocolDeskAvailability>();

  async function load(
    input: Partial<ProtocolDeskQueueQuery>,
    append = false,
  ): Promise<void> {
    setStatus("loading");
    try {
      const page = await listProtocolDeskQueue(input);
      setItems((current) =>
        append ? [...current, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    void Promise.all([listProtocolDeskQueue(), getProtocolDeskOperations()])
      .then(([page, snapshot]) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setOperations(snapshot);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Partial<ProtocolDeskQueueQuery> = {};
    const q = String(data.get("q") ?? "").trim();
    const state = String(data.get("state") ?? "") as
      | ProtocolDeskQueueQuery["state"]
      | "";
    const flag = String(data.get("flag") ?? "") as
      | ProtocolDeskQueueQuery["flag"]
      | "";
    if (q) next.q = q;
    if (state) next.state = state;
    if (flag) next.flag = flag;
    setFilters(next);
    void load(next);
  }

  function checkAvailability(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void checkProtocolDeskAvailability({
      startsAt: new Date(String(data.get("startsAt"))),
      endsAt: new Date(String(data.get("endsAt"))),
    })
      .then(setAvailability)
      .catch(() => setActionError("Availability could not be checked."));
  }

  async function open(requestId: string): Promise<void> {
    setActionError(undefined);
    try {
      setDetail(await getProtocolDeskRequest(requestId));
    } catch {
      setActionError("Request detail could not be loaded.");
    }
  }
  async function act(
    operation: () => Promise<ProtocolDeskRequestDetail>,
  ): Promise<void> {
    setActionError(undefined);
    try {
      setDetail(await operation());
    } catch {
      setActionError(
        "The operation could not be completed. Refresh and try again.",
      );
    }
  }

  return (
    <div className="desk-workspace">
      {operations ? (
        <section
          className="desk-operations"
          aria-labelledby="desk-operations-title"
        >
          <div>
            <p className="section-context">Service level</p>
            <h2 id="desk-operations-title">Operational health</h2>
          </div>
          <dl>
            <div>
              <dt>Overdue 48-hour responses</dt>
              <dd>{operations.overdueInitialResponses}</dd>
            </div>
            <div>
              <dt>Failed correspondence</dt>
              <dd>{operations.failedCorrespondence}</dd>
            </div>
            <div>
              <dt>Pending correspondence</dt>
              <dd>{operations.pendingCorrespondence}</dd>
            </div>
            <div>
              <dt>Failed calendar sync</dt>
              <dd>{operations.failedCalendarSync}</dd>
            </div>
            <div>
              <dt>Pending calendar sync</dt>
              <dd>{operations.pendingCalendarSync}</dd>
            </div>
            <div>
              <dt>Failed Principal decision delivery</dt>
              <dd>{operations.failedPrincipalDecisionDeliveries}</dd>
            </div>
            <div>
              <dt>Pending Principal decision delivery</dt>
              <dd>{operations.pendingPrincipalDecisionDeliveries}</dd>
            </div>
            <div>
              <dt>Open escalations</dt>
              <dd>{operations.openEscalations.length}</dd>
            </div>
          </dl>
          {operations.openEscalations.length ? (
            <ul aria-label="Open Protocol Desk escalations">
              {operations.openEscalations.map((escalation) => (
                <li key={escalation.escalationId}>
                  <strong>{escalation.reference}</strong>{" "}
                  {escalation.type.replaceAll("_", " ")} · {escalation.severity}
                </li>
              ))}
            </ul>
          ) : (
            <p>No open SLA escalations.</p>
          )}
          <form className="desk-availability" onSubmit={checkAvailability}>
            <label>
              Availability starts
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              Availability ends
              <input name="endsAt" type="datetime-local" required />
            </label>
            <button type="submit" className="secondary-button">
              Check availability
            </button>
          </form>
          {availability ? (
            <div role="status" className="desk-availability-result">
              <strong>
                {availability.available ? "Available" : "Unavailable"}
              </strong>
              {availability.conflicts.map((conflict) => (
                <p
                  key={`${conflict.type}-${conflict.reference}-${conflict.startsAt.toISOString()}`}
                >
                  {conflict.reference} · {conflict.type} · {conflict.reason}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <form
        className="desk-filters"
        onSubmit={submit}
        aria-label="Filter Protocol Desk queue"
      >
        <label>
          Search
          <input
            name="q"
            type="search"
            maxLength={120}
            placeholder="Reference, organisation or event"
          />
        </label>
        <label>
          State
          <select name="state">
            {states.map((state) => (
              <option key={state || "all"} value={state}>
                {state ? state.replaceAll("_", " ") : "All states"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flag
          <select name="flag">
            {flags.map((flag) => (
              <option key={flag || "all"} value={flag}>
                {flag ? flag.replaceAll("_", " ") : "All flags"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={status === "loading"}
        >
          Apply filters
        </button>
      </form>
      <div className="desk-queue-heading">
        <div>
          <p className="section-context">Advisory order</p>
          <h2>Engagement requests</h2>
        </div>
        <p>Scores order review only. Every decision remains human.</p>
      </div>
      {status === "error" ? (
        <div className="form-error" role="alert">
          The Protocol Desk queue could not be loaded.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void load(filters)}
          >
            Try again
          </button>
        </div>
      ) : null}
      {status === "loading" && items.length === 0 ? (
        <p role="status">Loading engagement requests…</p>
      ) : null}
      {status === "ready" && items.length === 0 ? (
        <p className="empty-state">No requests match these filters.</p>
      ) : null}
      {items.length ? (
        <div className="desk-table-wrap">
          <table className="desk-table">
            <thead>
              <tr>
                <th>Score</th>
                <th>Request</th>
                <th>Organisation</th>
                <th>Engagement</th>
                <th>State</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.requestId}>
                  <td>
                    <strong>{item.triageScore ?? "—"}</strong>
                  </td>
                  <td>
                    <strong>{item.reference}</strong>
                    <small>
                      {item.capacity} · {item.locale}
                    </small>
                  </td>
                  <td>
                    {item.organisationName}
                    <small>{item.organisationType}</small>
                  </td>
                  <td>
                    {item.eventName}
                    <small>
                      {item.engagementType} · {item.country} ·{" "}
                      <time dateTime={item.startsAt.toISOString()}>
                        {item.startsAt.toLocaleDateString()}
                      </time>
                    </small>
                  </td>
                  <td>
                    <span className="desk-state">
                      {item.state.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    <div className="desk-flags">
                      {item.flags.length ? (
                        item.flags.map((flag) => (
                          <span
                            key={`${flag.type}-${flag.detail}`}
                            className={`desk-flag desk-flag--${flag.severity}`}
                            title={flag.detail}
                          >
                            {flag.type.replaceAll("_", " ")}
                          </span>
                        ))
                      ) : (
                        <span>None</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void open(item.requestId)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="secondary-button"
          disabled={status === "loading"}
          onClick={() => void load({ ...filters, cursor: nextCursor }, true)}
        >
          Load more
        </button>
      ) : null}
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {detail ? (
        <RequestDetail
          detail={detail}
          principal={roles.includes("principal")}
          onClose={() => setDetail(undefined)}
          onAct={act}
        />
      ) : null}
    </div>
  );
}

function RequestDetail({
  detail,
  principal,
  onClose,
  onAct,
}: Readonly<{
  detail: ProtocolDeskRequestDetail;
  principal: boolean;
  onClose: () => void;
  onAct: (operation: () => Promise<ProtocolDeskRequestDetail>) => Promise<void>;
}>) {
  const request = detail.request;
  const [noteStatus, setNoteStatus] = useState<"idle" | "working" | "error">(
    "idle",
  );
  function assignment(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const assignee = String(
      new FormData(event.currentTarget).get("assigneeId") ?? "",
    );
    void onAct(() => assignProtocolDeskRequest(request.requestId, assignee));
  }
  function note(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    void onAct(() => addProtocolDeskNote(request.requestId, body)).then(() =>
      form.reset(),
    );
  }
  function transition(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onAct(() =>
      transitionProtocolDeskRequest(
        request.requestId,
        String(data.get("state")) as ProtocolDeskTransitionInput["state"],
        String(data.get("reason") ?? ""),
        String(data.get("state")) === "declined"
          ? (String(
              data.get("declineCategory"),
            ) as ProtocolDeskTransitionInput["declineCategory"])
          : undefined,
      ),
    );
  }
  function clearance(
    event: React.FormEvent<HTMLFormElement>,
    flagId: string,
  ): void {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") ?? "");
    void onAct(() => clearProtocolDeskFlag(request.requestId, flagId, reason));
  }
  async function protocolNote(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setNoteStatus("working");
    try {
      const data = new FormData(event.currentTarget);
      const lines = (key: string): string[] =>
        String(data.get(key) ?? "")
          .split(/\r?\n/u)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 12);
      const input: ProtocolNoteInput = {
        speakerContactName: String(data.get("speakerContactName") ?? ""),
        speakerContactEmail: String(data.get("speakerContactEmail") ?? ""),
        technicalRequirements: lines("technicalRequirements"),
        logistics: lines("logistics"),
        accessibilityRequirements: lines("accessibilityRequirements"),
        ...(String(data.get("arrivalTime") ?? "").trim()
          ? { arrivalTime: String(data.get("arrivalTime")).trim() }
          : {}),
        ...(String(data.get("briefingWindow") ?? "").trim()
          ? { briefingWindow: String(data.get("briefingWindow")).trim() }
          : {}),
        ...(String(data.get("rehearsalRequirement") ?? "").trim()
          ? {
              rehearsalRequirement: String(
                data.get("rehearsalRequirement"),
              ).trim(),
            }
          : {}),
        ...(String(data.get("displayRequirements") ?? "").trim()
          ? {
              displayRequirements: String(
                data.get("displayRequirements"),
              ).trim(),
            }
          : {}),
        lecternRequired: data.get("lecternRequired") === "yes",
      };
      if (["awaiting_decision", "held"].includes(request.state)) {
        await onAct(() => configureProtocolNote(request.requestId, input));
        setNoteStatus("idle");
        return;
      }
      const result = await generateProtocolNote(request.requestId);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      setNoteStatus("idle");
    } catch {
      setNoteStatus("error");
    }
  }
  return (
    <section className="desk-detail" aria-labelledby="desk-detail-title">
      <header>
        <div>
          <p className="section-context">{request.reference}</p>
          <h2 id="desk-detail-title">{request.eventName}</h2>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="desk-detail-grid">
        <dl>
          <dt>Requester</dt>
          <dd>
            {request.requester.name}, {request.requester.role}
            <br />
            <a href={`mailto:${request.requester.email}`}>
              {request.requester.email}
            </a>
          </dd>
          <dt>Objective</dt>
          <dd>{request.objective}</dd>
          <dt>Audience</dt>
          <dd>{request.audienceDescription}</dd>
          <dt>Assignment</dt>
          <dd>{request.assignedTo ?? "Unassigned"}</dd>
        </dl>
        <div>
          <h3>Triage factors</h3>
          {request.triageDimensions.map((dimension) => (
            <p key={dimension.key}>
              <strong>
                {dimension.key.replaceAll("_", " ")} · {dimension.score}
              </strong>
              <br />
              <small>{dimension.factors.join(" · ")}</small>
            </p>
          ))}
        </div>
      </div>
      <div>
        <h3>Correspondence</h3>
        {detail.correspondence.length ? (
          <ul className="desk-timeline">
            {detail.correspondence.map((message) => (
              <li key={message.correspondenceId}>
                <strong>{message.template.replaceAll("-", " ")}</strong>{" "}
                <span>
                  {message.locale} · {message.status}
                </span>
                {message.deliveredAt ? (
                  <time dateTime={message.deliveredAt.toISOString()}>
                    {message.deliveredAt.toLocaleString()}
                  </time>
                ) : null}
                {message.status === "failed" ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void onAct(() =>
                        retryProtocolDeskCorrespondence(
                          request.requestId,
                          message.correspondenceId,
                        ),
                      )
                    }
                  >
                    Retry delivery
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No correspondence has been queued.</p>
        )}
      </div>
      <div>
        <h3>Calendar synchronization</h3>
        {detail.calendarSync.length ? (
          <ul className="desk-timeline">
            {detail.calendarSync.map((job) => (
              <li key={job.syncId}>
                <strong>Calendar event</strong>{" "}
                <span>
                  {job.status} · {job.attempts} attempt
                  {job.attempts === 1 ? "" : "s"}
                </span>
                {job.completedAt ? (
                  <time dateTime={job.completedAt.toISOString()}>
                    {job.completedAt.toLocaleString()}
                  </time>
                ) : null}
                {job.providerEventId ? (
                  <small>Provider reference: {job.providerEventId}</small>
                ) : null}
                {job.lastError ? <small>{job.lastError}</small> : null}
                {job.status === "failed" ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void onAct(() =>
                        retryProtocolDeskCalendarSync(
                          request.requestId,
                          job.syncId,
                        ),
                      )
                    }
                  >
                    Retry calendar sync
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No calendar synchronization is required yet.</p>
        )}
      </div>
      <div>
        <h3>Principal decision delivery</h3>
        {detail.principalDecisionDelivery.length ? (
          <ul className="desk-timeline">
            {detail.principalDecisionDelivery.map((job) => (
              <li key={job.deliveryId}>
                <strong>Protocol Note and decision links</strong>{" "}
                <span>
                  {job.status} · {job.attempts} attempt
                  {job.attempts === 1 ? "" : "s"}
                </span>
                {job.deliveredAt ? (
                  <time dateTime={job.deliveredAt.toISOString()}>
                    {job.deliveredAt.toLocaleString()}
                  </time>
                ) : null}
                {job.status === "failed" ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void onAct(() =>
                        retryPrincipalDecisionDelivery(
                          request.requestId,
                          job.deliveryId,
                        ),
                      )
                    }
                  >
                    Retry Principal delivery
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No Principal decision delivery is required yet.</p>
        )}
      </div>
      {[
        "awaiting_decision",
        "held",
        "accepted",
        "contracted",
        "delivered",
      ].includes(request.state) ? (
        <form
          className="desk-note-generator"
          onSubmit={(event) => void protocolNote(event)}
        >
          <h3>Protocol Note</h3>
          <p>
            Uses the current approved identity, portrait and bilingual rider.
          </p>
          <label>
            Speaker-side contact
            <input
              name="speakerContactName"
              required
              maxLength={120}
              defaultValue={
                request.protocolNoteConfiguration?.speakerContactName
              }
            />
          </label>
          <label>
            Speaker-side email
            <input
              name="speakerContactEmail"
              type="email"
              required
              maxLength={254}
              defaultValue={
                request.protocolNoteConfiguration?.speakerContactEmail
              }
            />
          </label>
          <label>
            Technical overrides (one per line)
            <textarea
              name="technicalRequirements"
              rows={3}
              maxLength={6000}
              defaultValue={request.protocolNoteConfiguration?.technicalRequirements.join(
                "\n",
              )}
            />
          </label>
          <label>
            Logistics overrides (one per line)
            <textarea
              name="logistics"
              rows={3}
              maxLength={6000}
              defaultValue={request.protocolNoteConfiguration?.logistics.join(
                "\n",
              )}
            />
          </label>
          <label>
            Accessibility overrides (one per line)
            <textarea
              name="accessibilityRequirements"
              rows={3}
              maxLength={6000}
              defaultValue={request.protocolNoteConfiguration?.accessibilityRequirements.join(
                "\n",
              )}
            />
          </label>
          <label>
            Arrival time
            <input
              name="arrivalTime"
              maxLength={120}
              defaultValue={request.protocolNoteConfiguration?.arrivalTime}
            />
          </label>
          <label>
            Briefing window
            <input
              name="briefingWindow"
              maxLength={240}
              defaultValue={request.protocolNoteConfiguration?.briefingWindow}
            />
          </label>
          <label>
            Rehearsal requirement
            <input
              name="rehearsalRequirement"
              maxLength={240}
              defaultValue={
                request.protocolNoteConfiguration?.rehearsalRequirement
              }
            />
          </label>
          <label>
            Display requirements
            <textarea
              name="displayRequirements"
              maxLength={500}
              defaultValue={
                request.protocolNoteConfiguration?.displayRequirements
              }
            />
          </label>
          <label>
            Lectern required
            <select
              name="lecternRequired"
              defaultValue={
                request.protocolNoteConfiguration?.lecternRequired
                  ? "yes"
                  : "no"
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <button className="secondary-button" type="submit">
            {noteStatus === "working"
              ? "Generating…"
              : ["awaiting_decision", "held"].includes(request.state)
                ? "Save Protocol Note configuration"
                : "Download Protocol Note"}
          </button>
          {noteStatus === "error" ? (
            <p className="form-error" role="alert">
              The Protocol Note could not be generated. Confirm the approved
              rider and portrait, then try again.
            </p>
          ) : null}
        </form>
      ) : null}
      <div className="desk-actions">
        <form onSubmit={assignment}>
          <label>
            Assign to
            <input
              name="assigneeId"
              defaultValue={request.assignedTo}
              required
              maxLength={128}
            />
          </label>
          <button className="secondary-button">Assign</button>
        </form>
        <form onSubmit={note}>
          <label>
            Internal note
            <textarea name="body" required maxLength={4000} />
          </label>
          <button className="secondary-button">Add note</button>
        </form>
        {detail.nextStates.some(
          (state) => principal || !["accepted", "declined"].includes(state),
        ) ? (
          <form onSubmit={transition}>
            <label>
              Next state
              <select name="state" required>
                {detail.nextStates
                  .filter(
                    (state) =>
                      principal || !["accepted", "declined"].includes(state),
                  )
                  .map((state) => (
                    <option key={state} value={state}>
                      {transitionLabels[state]}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Reason
              <textarea name="reason" required maxLength={1000} />
            </label>
            <label>
              Decline category (required when declining)
              <select name="declineCategory" defaultValue="capacity">
                <option value="capacity">Diary / capacity</option>
                <option value="fit">Fit</option>
                <option value="conflict">Public-office conflict</option>
              </select>
            </label>
            <button className="primary-button">Apply transition</button>
          </form>
        ) : (
          <p>No lifecycle transition is available for this role and state.</p>
        )}
      </div>
      <div className="desk-clearances">
        <h3>Flag review</h3>
        {request.flags.length ? (
          request.flags.map((flag) => (
            <article key={flag.flagId}>
              <div>
                <strong>{flag.type.replaceAll("_", " ")}</strong>
                <p>{flag.detail}</p>
                {flag.clearedAt ? (
                  <small>
                    Cleared by {flag.clearedBy}: {flag.clearanceReason}
                  </small>
                ) : null}
              </div>
              {!flag.clearedAt ? (
                <form onSubmit={(event) => clearance(event, flag.flagId)}>
                  <label>
                    Clearance reason
                    <input name="reason" required maxLength={1000} />
                  </label>
                  <button className="secondary-button">Clear flag</button>
                </form>
              ) : null}
            </article>
          ))
        ) : (
          <p>No flags.</p>
        )}
      </div>
      <div className="desk-history">
        <div>
          <h3>Internal notes</h3>
          {detail.notes.length ? (
            <ol>
              {detail.notes.map((note) => (
                <li key={note.noteId}>
                  <p>{note.body}</p>
                  <small>
                    {note.authorRole} ·{" "}
                    <time dateTime={note.createdAt.toISOString()}>
                      {note.createdAt.toLocaleString()}
                    </time>
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No internal notes.</p>
          )}
        </div>
        <div>
          <h3>Immutable timeline</h3>
          <ol>
            {detail.events.map((event) => (
              <li key={event.eventId}>
                <strong>
                  {event.category === "access"
                    ? "Access"
                    : `${event.fromState ?? "new"} → ${event.toState}`}
                </strong>
                <p>{event.reason}</p>
                <small>
                  {event.actorRole} · {event.actorId} ·{" "}
                  <time dateTime={event.occurredAt.toISOString()}>
                    {event.occurredAt.toLocaleString()}
                  </time>
                </small>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
