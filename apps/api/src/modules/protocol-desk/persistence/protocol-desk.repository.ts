import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InjectConnection } from "@nestjs/mongoose";
import type { ClientSession, Collection } from "mongodb";
import type { Connection } from "mongoose";
import {
  assignRequest,
  clearRequestFlag,
  createRequest,
  createRequestNote,
  nextRequestStates,
  screenRequest,
  transitionRequest,
  type EngagementRequest,
  type EngagementRequestInput,
  type RequestEvent,
  type RequestNote,
  type RequestState,
} from "../domain/engagement-request";
import type { TriageContext } from "../domain/triage-engine";
import type {
  ProtocolDeskQueueItem,
  ProtocolDeskQueuePage,
  ProtocolDeskQueueQuery,
  ProtocolDeskRequestDetail,
} from "@amanor/contracts";
import type { Role } from "../../auth/domain/roles";
import {
  submissionCorrespondence,
  transitionCorrespondence,
  type CorrespondenceJob,
} from "../domain/correspondence";
import type { ProtocolDeskTransitionInput } from "@amanor/contracts";
import type { ProtocolNoteInput } from "@amanor/contracts";
import { calendarSyncJob, type CalendarSyncJob } from "../domain/calendar-sync";
import {
  deriveDecisionToken,
  hashDecisionToken,
  issueDecisionCapability,
  issueDeliveryDecisionCapability,
  stateForDecision,
  type DecisionCapability,
  type PrincipalDecisionAction,
} from "../domain/decision-capability";
import {
  principalDecisionDelivery,
  type PrincipalDecisionDelivery,
} from "../domain/principal-decision-delivery";

type Sequence = Readonly<{ key: "request-reference"; value: number }>;

@Injectable()
export class ProtocolDeskRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private collections(): Readonly<{
    requests: Collection<EngagementRequest>;
    events: Collection<RequestEvent>;
    notes: Collection<RequestNote>;
    sequences: Collection<Sequence>;
    correspondence: Collection<CorrespondenceJob>;
    calendarSync: Collection<CalendarSyncJob>;
    decisionCapabilities: Collection<DecisionCapability>;
    principalDecisionDeliveries: Collection<PrincipalDecisionDelivery>;
  }> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return {
      requests:
        this.connection.db.collection<EngagementRequest>("protocol_requests"),
      events: this.connection.db.collection<RequestEvent>(
        "protocol_request_events",
      ),
      notes: this.connection.db.collection<RequestNote>(
        "protocol_request_notes",
      ),
      sequences: this.connection.db.collection<Sequence>("protocol_sequences"),
      correspondence:
        this.connection.db.collection<CorrespondenceJob>("correspondence"),
      calendarSync:
        this.connection.db.collection<CalendarSyncJob>("calendar_sync_jobs"),
      decisionCapabilities: this.connection.db.collection<DecisionCapability>(
        "protocol_decision_capabilities",
      ),
      principalDecisionDeliveries:
        this.connection.db.collection<PrincipalDecisionDelivery>(
          "protocol_principal_decision_deliveries",
        ),
    };
  }

  async create(
    input: EngagementRequestInput,
    now = new Date(),
    triageContext?: TriageContext,
  ): Promise<EngagementRequest> {
    const session = await this.connection.startSession();
    let created: EngagementRequest | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, events, sequences, correspondence } =
          this.collections();
        const sequence = await sequences.findOneAndUpdate(
          { key: "request-reference" },
          { $inc: { value: 1 }, $setOnInsert: { key: "request-reference" } },
          { upsert: true, returnDocument: "after", session },
        );
        if (!sequence)
          throw new Error("Protocol Desk reference sequence was not created");
        const aggregate = createRequest(input, sequence.value, now);
        const screened = triageContext
          ? screenRequest(aggregate.request, triageContext)
          : undefined;
        await requests.insertOne(screened?.request ?? aggregate.request, {
          session,
        });
        await events.insertMany(
          screened ? [aggregate.event, screened.event] : [aggregate.event],
          { session },
        );
        await correspondence.insertMany(
          [...submissionCorrespondence(aggregate.request, now)],
          { session },
        );
        created = screened?.request ?? aggregate.request;
      });
    } finally {
      await session.endSession();
    }
    if (!created)
      throw new Error("Protocol Desk request transaction did not commit");
    return created;
  }

  async events(
    requestId: string,
    session?: ClientSession,
  ): Promise<readonly RequestEvent[]> {
    return this.collections()
      .events.find({ requestId }, session ? { session } : {})
      .sort({ occurredAt: 1 })
      .toArray();
  }

  async findRequest(requestId: string): Promise<EngagementRequest | null> {
    return this.collections().requests.findOne({ requestId });
  }

  async transition(
    requestId: string,
    toState: RequestState,
    actor: Readonly<{ id: string; roles: readonly Role[]; system?: boolean }>,
    reason: string,
    declineCategory?: ProtocolDeskTransitionInput["declineCategory"],
    now = new Date(),
  ): Promise<EngagementRequest> {
    const session = await this.connection.startSession();
    let updated: EngagementRequest | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, events, correspondence, calendarSync } =
          this.collections();
        const current = await requests.findOne({ requestId }, { session });
        if (!current) throw new Error("Protocol Desk request was not found");
        if (toState === "accepted" && !current.protocolNoteConfiguration)
          throw new Error(
            "Protocol Note configuration is required before acceptance",
          );
        const transition = transitionRequest(
          current,
          toState,
          actor,
          reason,
          now,
        );
        const result = await requests.replaceOne(
          { requestId, state: current.state },
          transition.request,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Protocol Desk request changed concurrently");
        await events.insertOne(transition.event, { session });
        const messages = transitionCorrespondence(
          transition.request,
          { state: toState, declineCategory },
          now,
        );
        if (messages.length)
          await correspondence.insertMany([...messages], { session });
        if (toState === "accepted")
          await calendarSync.insertOne(calendarSyncJob(requestId, now), {
            session,
          });
        updated = transition.request;
      });
    } finally {
      await session.endSession();
    }
    if (!updated)
      throw new Error("Protocol Desk transition transaction did not commit");
    return updated;
  }

  async screen(
    requestId: string,
    context: TriageContext,
  ): Promise<EngagementRequest> {
    const session = await this.connection.startSession();
    let updated: EngagementRequest | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, events } = this.collections();
        const current = await requests.findOne({ requestId }, { session });
        if (!current) throw new Error("Protocol Desk request was not found");
        const screening = screenRequest(current, context);
        const result = await requests.replaceOne(
          { requestId, state: "received" },
          screening.request,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Protocol Desk request changed concurrently");
        await events.insertOne(screening.event, { session });
        updated = screening.request;
      });
    } finally {
      await session.endSession();
    }
    if (!updated)
      throw new Error("Protocol Desk screening transaction did not commit");
    return updated;
  }

  async addNote(
    requestId: string,
    body: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<RequestNote> {
    const session = await this.connection.startSession();
    let created: RequestNote | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, notes, events } = this.collections();
        const request = await requests.findOne({ requestId }, { session });
        if (!request) throw new Error("Protocol Desk request was not found");
        const note = createRequestNote(requestId, body, actor, now);
        const event: RequestEvent = {
          eventId: randomUUID(),
          requestId,
          category: "action",
          fromState: request.state,
          toState: request.state,
          actorId: actor.id,
          actorRole: note.authorRole,
          reason: "Internal note added",
          occurredAt: now,
        };
        await notes.insertOne(note, { session });
        await events.insertOne(event, { session });
        created = note;
      });
    } finally {
      await session.endSession();
    }
    if (!created)
      throw new Error("Protocol Desk note transaction did not commit");
    return created;
  }

  async assign(
    requestId: string,
    assigneeId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<EngagementRequest> {
    const session = await this.connection.startSession();
    let updated: EngagementRequest | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, events } = this.collections();
        const current = await requests.findOne({ requestId }, { session });
        if (!current) throw new Error("Protocol Desk request was not found");
        const assignment = assignRequest(current, assigneeId, actor, now);
        const result = await requests.replaceOne(
          { requestId, updatedAt: current.updatedAt },
          assignment.request,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Protocol Desk request changed concurrently");
        await events.insertOne(assignment.event, { session });
        updated = assignment.request;
      });
    } finally {
      await session.endSession();
    }
    if (!updated)
      throw new Error("Protocol Desk assignment transaction did not commit");
    return updated;
  }

  async clearFlag(
    requestId: string,
    flagId: string,
    reason: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<EngagementRequest> {
    const session = await this.connection.startSession();
    let updated: EngagementRequest | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, events } = this.collections();
        const current = await requests.findOne({ requestId }, { session });
        if (!current) throw new Error("Protocol Desk request was not found");
        const clearance = clearRequestFlag(current, flagId, reason, actor, now);
        const result = await requests.replaceOne(
          { requestId, updatedAt: current.updatedAt },
          clearance.request,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Protocol Desk request changed concurrently");
        await events.insertOne(clearance.event, { session });
        updated = clearance.request;
      });
    } finally {
      await session.endSession();
    }
    if (!updated)
      throw new Error(
        "Protocol Desk flag clearance transaction did not commit",
      );
    return updated;
  }

  async detail(requestId: string): Promise<ProtocolDeskRequestDetail | null> {
    const {
      requests,
      events,
      notes,
      correspondence,
      calendarSync,
      principalDecisionDeliveries,
    } = this.collections();
    const row = await requests.findOne({ requestId });
    if (!row) return null;
    const [history, internalNotes, messages, calendarJobs, decisionDeliveries] =
      await Promise.all([
        events.find({ requestId }).sort({ occurredAt: 1 }).toArray(),
        notes.find({ requestId }).sort({ createdAt: 1 }).toArray(),
        correspondence
          .find(
            { requestId },
            { projection: { _id: 0, recipient: 0, lockedAt: 0 } },
          )
          .sort({ createdAt: 1 })
          .toArray(),
        calendarSync
          .find(
            { requestId },
            {
              projection: {
                _id: 0,
                requestId: 0,
                createdAt: 0,
                lockedAt: 0,
              },
            },
          )
          .limit(1)
          .toArray(),
        principalDecisionDeliveries
          .find(
            { requestId },
            {
              projection: {
                _id: 0,
                requestId: 0,
                createdAt: 0,
                lockedAt: 0,
                providerMessageId: 0,
                lastError: 0,
              },
            },
          )
          .limit(1)
          .toArray(),
      ]);
    return {
      request: {
        requestId: row.requestId,
        reference: row.reference,
        state: row.state,
        capacity: row.capacity,
        organisationName: row.organisation.name,
        organisationType: row.organisation.type,
        eventName: row.engagement.eventName,
        engagementType: row.engagement.type,
        startsAt: row.engagement.startsAt,
        country: row.engagement.country,
        locale: row.locale,
        triageScore: row.triageScore ?? null,
        flags: row.flags.map((flag) => ({ ...flag })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        requester: row.requester,
        objective: row.ask.objective,
        audienceDescription: row.engagement.audienceDescription,
        contactName: row.logistics.contactName,
        contactPhone: row.logistics.contactPhone,
        triageDimensions: (row.triageAssessment?.dimensions ?? []).map(
          (dimension) => ({ ...dimension, factors: [...dimension.factors] }),
        ),
        ...(row.assignedTo ? { assignedTo: row.assignedTo } : {}),
        ...(row.assignedAt ? { assignedAt: row.assignedAt } : {}),
        ...(row.assignedBy ? { assignedBy: row.assignedBy } : {}),
        ...(row.protocolNoteConfiguration
          ? {
              protocolNoteConfiguration: {
                ...row.protocolNoteConfiguration,
                technicalRequirements: [
                  ...row.protocolNoteConfiguration.technicalRequirements,
                ],
                logistics: [...row.protocolNoteConfiguration.logistics],
                accessibilityRequirements: [
                  ...row.protocolNoteConfiguration.accessibilityRequirements,
                ],
              },
            }
          : {}),
      },
      nextStates: [...nextRequestStates(row.state)],
      events: history,
      notes: internalNotes,
      correspondence: messages,
      calendarSync: calendarJobs,
      principalDecisionDelivery: decisionDeliveries,
    };
  }

  async recordAccess(
    requestId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    reason: "Request detail viewed" | "Request surfaced in operator queue",
    now = new Date(),
  ): Promise<boolean> {
    const request = await this.collections().requests.findOne(
      { requestId },
      { projection: { requestId: 1, state: 1 } },
    );
    if (!request) return false;
    await this.collections().events.insertOne({
      eventId: randomUUID(),
      requestId,
      category: "access",
      fromState: request.state,
      toState: request.state,
      actorId: actor.id,
      actorRole: this.operatorRole(actor.roles),
      reason,
      occurredAt: now,
    });
    return true;
  }

  async recordQueueAccess(
    items: ProtocolDeskQueuePage["items"],
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<void> {
    if (!items.length) return;
    await this.collections().events.insertMany(
      items.map((item) => ({
        eventId: randomUUID(),
        requestId: item.requestId,
        category: "access" as const,
        fromState: item.state,
        toState: item.state,
        actorId: actor.id,
        actorRole: this.operatorRole(actor.roles),
        reason: "Request surfaced in operator queue",
        occurredAt: now,
      })),
    );
  }

  async listQueue(
    query: ProtocolDeskQueueQuery,
  ): Promise<ProtocolDeskQueuePage> {
    const cursor = query.cursor
      ? this.decodeQueueCursor(query.cursor)
      : undefined;
    const search = query.q
      ? query.q.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
      : undefined;
    const cursorFilter =
      cursor?.score === -1
        ? {
            triageScore: { $exists: false },
            $or: [
              { createdAt: { $gt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                requestId: { $gt: cursor.requestId },
              },
            ],
          }
        : cursor
          ? {
              $or: [
                { triageScore: { $lt: cursor.score } },
                {
                  triageScore: cursor.score,
                  createdAt: { $gt: cursor.createdAt },
                },
                {
                  triageScore: cursor.score,
                  createdAt: cursor.createdAt,
                  requestId: { $gt: cursor.requestId },
                },
                { triageScore: { $exists: false } },
              ],
            }
          : undefined;
    const filters: Record<string, unknown>[] = [
      ...(query.state ? [{ state: query.state }] : []),
      ...(query.capacity ? [{ capacity: query.capacity }] : []),
      ...(query.flag ? [{ "flags.type": query.flag }] : []),
      ...(search
        ? [
            {
              $or: [
                { reference: { $regex: search, $options: "i" } },
                { "organisation.name": { $regex: search, $options: "i" } },
                { "engagement.eventName": { $regex: search, $options: "i" } },
              ],
            },
          ]
        : []),
      ...(cursorFilter ? [cursorFilter] : []),
    ];
    const rows = await this.collections()
      .requests.find(filters.length ? { $and: filters } : {}, {
        projection: {
          requester: 0,
          logistics: 0,
          ask: 0,
          consent: 0,
          capacityContext: 0,
          capacityFunding: 0,
        },
      })
      .sort({ triageScore: -1, createdAt: 1, requestId: 1 })
      .limit(query.limit + 1)
      .toArray();
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const items: ProtocolDeskQueueItem[] = pageRows.map((row) => ({
      requestId: row.requestId,
      reference: row.reference,
      state: row.state,
      capacity: row.capacity,
      organisationName: row.organisation.name,
      organisationType: row.organisation.type,
      eventName: row.engagement.eventName,
      engagementType: row.engagement.type,
      startsAt: row.engagement.startsAt,
      country: row.engagement.country,
      locale: row.locale,
      triageScore: row.triageScore ?? null,
      flags: row.flags.map(({ flagId, type, severity, detail }) => ({
        flagId,
        type,
        severity,
        detail,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    const last = pageRows.at(-1);
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                score: last.triageScore ?? -1,
                createdAt: last.createdAt.toISOString(),
                requestId: last.requestId,
              }),
              "utf8",
            ).toString("base64url"),
          }
        : {}),
    };
  }

  async retryCorrespondence(
    requestId: string,
    correspondenceId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const { requests, events, correspondence } = this.collections();
        const request = await requests.findOne({ requestId }, { session });
        if (!request) throw new Error("Failed correspondence was not found");
        const result = await correspondence.updateOne(
          { requestId, correspondenceId, status: "failed" },
          {
            $set: { status: "pending", availableAt: now, attempts: 0 },
            $unset: { lockedAt: "", lastError: "" },
          },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Failed correspondence was not found");
        await events.insertOne(
          {
            eventId: randomUUID(),
            requestId,
            category: "action",
            fromState: request.state,
            toState: request.state,
            actorId: actor.id,
            actorRole: this.operatorRole(actor.roles),
            reason: "Correspondence retry requested",
            occurredAt: now,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async retryCalendarSync(
    requestId: string,
    syncId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const { requests, events, calendarSync } = this.collections();
        const request = await requests.findOne({ requestId }, { session });
        if (!request)
          throw new Error("Failed calendar synchronization was not found");
        const result = await calendarSync.updateOne(
          { requestId, syncId, status: "failed" },
          {
            $set: { status: "pending", availableAt: now, attempts: 0 },
            $unset: { lockedAt: "", lastError: "" },
          },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Failed calendar synchronization was not found");
        await events.insertOne(
          {
            eventId: randomUUID(),
            requestId,
            category: "action",
            fromState: request.state,
            toState: request.state,
            actorId: actor.id,
            actorRole: this.operatorRole(actor.roles),
            reason: "Calendar synchronization retry requested",
            occurredAt: now,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async retryPrincipalDecisionDelivery(
    requestId: string,
    deliveryId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const { requests, events, principalDecisionDeliveries } =
          this.collections();
        const request = await requests.findOne({ requestId }, { session });
        if (!request)
          throw new Error("Failed Principal decision delivery was not found");
        const result = await principalDecisionDeliveries.updateOne(
          { requestId, deliveryId, status: "failed" },
          {
            $set: { status: "pending", availableAt: now, attempts: 0 },
            $unset: { lockedAt: "", lastError: "" },
          },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Failed Principal decision delivery was not found");
        await events.insertOne(
          {
            eventId: randomUUID(),
            requestId,
            category: "action",
            fromState: request.state,
            toState: request.state,
            actorId: actor.id,
            actorRole: this.operatorRole(actor.roles),
            reason: "Principal decision delivery retry requested",
            occurredAt: now,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async configureProtocolNote(
    requestId: string,
    input: ProtocolNoteInput,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const {
          requests,
          events,
          decisionCapabilities,
          principalDecisionDeliveries,
        } = this.collections();
        const request = await requests.findOne({ requestId }, { session });
        if (!request) throw new Error("Protocol Desk request was not found");
        if (!["awaiting_decision", "held"].includes(request.state))
          throw new Error(
            "Protocol Note configuration is available only before acceptance",
          );
        const actorRole = actor.roles.includes("principal")
          ? "principal"
          : "desk_officer";
        const result = await requests.updateOne(
          { requestId, state: request.state, updatedAt: request.updatedAt },
          {
            $set: {
              protocolNoteConfiguration: {
                ...input,
                configuredAt: now,
                configuredBy: actor.id,
              },
              updatedAt: now,
            },
          },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Protocol Desk request changed concurrently");
        await events.insertOne(
          {
            eventId: randomUUID(),
            requestId,
            category: "action",
            fromState: request.state,
            toState: request.state,
            actorId: actor.id,
            actorRole,
            reason: "Protocol Note configuration updated",
            occurredAt: now,
          },
          { session },
        );
        await decisionCapabilities.updateMany(
          { requestId, status: "active" },
          { $set: { status: "revoked" } },
          { session },
        );
        await principalDecisionDeliveries.replaceOne(
          { requestId },
          principalDecisionDelivery(requestId, now),
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async issuePrincipalDecisionCapability(
    requestId: string,
    action: PrincipalDecisionAction,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    now = new Date(),
  ): Promise<Readonly<{ token: string; expiresAt: Date }>> {
    if (!actor.roles.includes("principal"))
      throw new Error("Only the Principal can issue a decision link");
    const session = await this.connection.startSession();
    let issued: Readonly<{ token: string; expiresAt: Date }> | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, decisionCapabilities } = this.collections();
        const request = await requests.findOne({ requestId }, { session });
        if (!request) throw new Error("Protocol Desk request was not found");
        if (!request.protocolNoteConfiguration)
          throw new Error(
            "Protocol Note configuration is required before a decision link",
          );
        if (
          !nextRequestStates(request.state).includes(stateForDecision(action))
        )
          throw new Error("Decision is not available for the request state");
        const created = issueDecisionCapability(
          requestId,
          action,
          actor.id,
          now,
        );
        await decisionCapabilities.updateMany(
          { requestId, action, status: "active" },
          { $set: { status: "revoked" } },
          { session },
        );
        await decisionCapabilities.insertOne(created.capability, { session });
        issued = {
          token: created.token,
          expiresAt: created.capability.expiresAt,
        };
      });
    } finally {
      await session.endSession();
    }
    if (!issued) throw new Error("Decision link transaction did not commit");
    return issued;
  }

  async consumePrincipalDecisionCapability(
    token: string,
    action: PrincipalDecisionAction,
    reason: string,
    declineCategory?: ProtocolDeskTransitionInput["declineCategory"],
    now = new Date(),
  ): Promise<Readonly<{ reference: string; state: RequestState }>> {
    const session = await this.connection.startSession();
    let result:
      | Readonly<{ reference: string; state: RequestState }>
      | undefined;
    try {
      await session.withTransaction(async () => {
        const {
          requests,
          events,
          correspondence,
          calendarSync,
          decisionCapabilities,
        } = this.collections();
        const capability = await decisionCapabilities.findOneAndUpdate(
          {
            tokenHash: hashDecisionToken(token),
            action,
            status: "active",
            expiresAt: { $gt: now },
          },
          { $set: { status: "consumed", consumedAt: now } },
          { session, returnDocument: "after" },
        );
        if (!capability)
          throw new Error("Decision link is invalid, expired, or already used");
        const current = await requests.findOne(
          { requestId: capability.requestId },
          { session },
        );
        if (!current) throw new Error("Protocol Desk request was not found");
        const toState = stateForDecision(action);
        const transition = transitionRequest(
          current,
          toState,
          {
            id: `decision-link:${capability.capabilityId}`,
            roles: ["principal"],
          },
          reason,
          now,
        );
        const replaced = await requests.replaceOne(
          { requestId: current.requestId, state: current.state },
          transition.request,
          { session },
        );
        if (replaced.modifiedCount !== 1)
          throw new Error("Protocol Desk request changed concurrently");
        await events.insertOne(transition.event, { session });
        const messages = transitionCorrespondence(
          transition.request,
          { state: toState, declineCategory },
          now,
        );
        if (messages.length)
          await correspondence.insertMany([...messages], { session });
        if (toState === "accepted")
          await calendarSync.insertOne(
            calendarSyncJob(current.requestId, now),
            {
              session,
            },
          );
        await decisionCapabilities.updateMany(
          {
            requestId: current.requestId,
            capabilityId: { $ne: capability.capabilityId },
            status: "active",
          },
          { $set: { status: "revoked" } },
          { session },
        );
        result = { reference: current.reference, state: toState };
      });
    } finally {
      await session.endSession();
    }
    if (!result) throw new Error("Decision link transaction did not commit");
    return result;
  }

  async requestForDecisionCapability(
    token: string,
    action: PrincipalDecisionAction,
    now = new Date(),
  ): Promise<EngagementRequest | null> {
    const capability = await this.collections().decisionCapabilities.findOne({
      tokenHash: hashDecisionToken(token),
      action,
      status: "active",
      expiresAt: { $gt: now },
    });
    if (!capability) return null;
    return this.findRequest(capability.requestId);
  }

  async capabilitiesForPrincipalDelivery(
    requestId: string,
    deliveryId: string,
    principalId: string,
    derivationKey: string,
  ): Promise<Readonly<Partial<Record<PrincipalDecisionAction, string>>>> {
    const session = await this.connection.startSession();
    let tokens:
      | Readonly<Partial<Record<PrincipalDecisionAction, string>>>
      | undefined;
    try {
      await session.withTransaction(async () => {
        const { requests, decisionCapabilities, principalDecisionDeliveries } =
          this.collections();
        // MongoDB sessions do not support parallel operations inside a
        // transaction. Keep these reads sequential so they share the same
        // transaction number safely on replica sets as well as sharded
        // clusters.
        const request = await requests.findOne({ requestId }, { session });
        const delivery = await principalDecisionDeliveries.findOne(
          { requestId, deliveryId },
          { session },
        );
        if (!request || !delivery)
          throw new Error("Principal decision delivery is unavailable");
        if (!request.protocolNoteConfiguration)
          throw new Error("Protocol Note configuration is unavailable");
        if (!["awaiting_decision", "held"].includes(request.state))
          throw new Error("Request is no longer awaiting a Principal decision");
        let capabilities: readonly DecisionCapability[] =
          await decisionCapabilities
            .find({ requestId, deliveryId, status: "active" }, { session })
            .toArray();
        if (capabilities.length === 0) {
          const actions = nextRequestStates(request.state)
            .map((state) => {
              if (state === "accepted") return "accept";
              if (state === "declined") return "decline";
              if (state === "held") return "hold";
              if (state === "info_requested") return "request_information";
              return undefined;
            })
            .filter((action): action is PrincipalDecisionAction =>
              Boolean(action),
            );
          const issued = actions.map((action) =>
            issueDeliveryDecisionCapability(
              requestId,
              deliveryId,
              action,
              principalId,
              derivationKey,
              delivery.createdAt,
            ),
          );
          if (issued.length === 0)
            throw new Error("No Principal decision is available");
          await decisionCapabilities.insertMany(
            issued.map((item) => item.capability),
            { session },
          );
          capabilities = issued.map((item) => item.capability);
        }
        const result = {} as Record<PrincipalDecisionAction, string>;
        for (const capability of capabilities) {
          const token = deriveDecisionToken(capability, derivationKey);
          if (hashDecisionToken(token) !== capability.tokenHash)
            throw new Error("Principal decision capability integrity failed");
          result[capability.action] = token;
        }
        tokens = result;
      });
    } finally {
      await session.endSession();
    }
    if (!tokens)
      throw new Error(
        "Principal decision capability transaction did not commit",
      );
    return tokens;
  }

  private decodeQueueCursor(
    value: string,
  ): Readonly<{ score: number; createdAt: Date; requestId: string }> {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const createdAt = new Date(String(parsed.createdAt));
      if (
        !Number.isInteger(parsed.score) ||
        Number(parsed.score) < -1 ||
        Number(parsed.score) > 100 ||
        Number.isNaN(createdAt.getTime()) ||
        typeof parsed.requestId !== "string"
      )
        throw new Error("invalid");
      return {
        score: Number(parsed.score),
        createdAt,
        requestId: parsed.requestId,
      };
    } catch {
      throw new Error("Protocol Desk queue cursor is invalid");
    }
  }

  private operatorRole(roles: readonly Role[]): "principal" | "desk_officer" {
    if (roles.includes("principal")) return "principal";
    if (roles.includes("desk_officer")) return "desk_officer";
    throw new Error("Protocol Desk operator role is required");
  }
}
