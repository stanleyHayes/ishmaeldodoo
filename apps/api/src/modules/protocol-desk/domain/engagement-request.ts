import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Role } from "../../auth/domain/roles";
import { httpsUrlSchema, type ProtocolNoteInput } from "@amanor/contracts";
import {
  classifyCapacity,
  type CapacityAssessment,
} from "./capacity-classifier";
import {
  assessTriage,
  type TriageAssessment,
  type TriageContext,
} from "./triage-engine";

export const requestStates = [
  "received",
  "screened",
  "awaiting_decision",
  "info_requested",
  "held",
  "accepted",
  "contracted",
  "delivered",
  "declined",
  "lapsed",
  "archived",
] as const;
export type RequestState = (typeof requestStates)[number];

export const capacities = ["official", "personal", "unsure"] as const;
export const engagementTypes = [
  "keynote",
  "panel",
  "fireside",
  "institutional_briefing",
  "media_interview",
  "advisory",
  "academic",
  "youth",
  "written_contribution",
] as const;

export const engagementRequestInputSchema = z
  .object({
    locale: z.enum(["en-GB", "fr-FR"]),
    capacity: z.enum(capacities),
    capacityContext: z.string().trim().min(5).max(300).optional(),
    capacityFunding: z.string().trim().min(2).max(200).optional(),
    organisation: z.object({
      name: z.string().trim().min(2).max(180),
      type: z.enum([
        "government",
        "multilateral",
        "private_sector",
        "academic",
        "civil_society",
        "media",
        "other",
      ]),
      country: z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
      website: httpsUrlSchema.max(500).optional(),
      convenors: z.string().trim().max(1_000).optional(),
    }),
    requester: z.object({
      name: z.string().trim().min(2).max(120),
      role: z.string().trim().min(2).max(120),
      email: z
        .email()
        .max(254)
        .transform((value) => value.toLowerCase()),
      phone: z.string().trim().min(7).max(40).optional(),
    }),
    engagement: z.object({
      type: z.enum(engagementTypes),
      eventName: z.string().trim().min(2).max(200),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date().optional(),
      city: z.string().trim().min(2).max(120),
      country: z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
      venue: z.string().trim().max(200).optional(),
      format: z.enum(["in_person", "virtual", "hybrid"]),
      language: z.enum(["english", "french", "both"]),
      interpretationProvided: z.boolean().optional(),
      audienceSize: z.number().int().min(1).max(1_000_000),
      audienceDescription: z.string().trim().min(10).max(1_500),
      edition: z.string().trim().max(120).optional(),
    }),
    ask: z.object({
      proposedTheme: z.string().trim().min(2).max(240),
      objective: z.string().trim().min(10).max(1_500),
      otherSpeakers: z.string().trim().max(1_000).optional(),
      recording: z.boolean(),
      transcriptRights: z.boolean().optional(),
      republicationRights: z.boolean().optional(),
    }),
    logistics: z.object({
      travel: z.enum(["host_covered", "not_covered", "discuss"]),
      honorarium: z.enum(["offered", "not_offered", "discuss"]).optional(),
      invitationLetter: z.boolean(),
      visaLetter: z.boolean(),
      governmentProtocol: z.boolean(),
      otherPrincipals: z.boolean(),
      securityConsiderations: z.string().trim().max(1_000).optional(),
      contactName: z.string().trim().min(2).max(120),
      contactPhone: z.string().trim().min(7).max(40),
    }),
    consent: z.object({
      dataProcessing: z.literal(true),
      authorityToInvite: z.literal(true),
      version: z.string().trim().min(1).max(40),
    }),
  })
  .superRefine((input, context) => {
    if (
      input.engagement.endsAt &&
      input.engagement.endsAt < input.engagement.startsAt
    )
      context.addIssue({
        code: "custom",
        path: ["engagement", "endsAt"],
        message: "End date cannot precede start date",
      });
    if (
      input.capacity === "official" &&
      input.logistics.honorarium !== undefined
    )
      context.addIssue({
        code: "custom",
        path: ["logistics", "honorarium"],
        message: "Official-capacity requests cannot record an honorarium",
      });
    if (
      input.engagement.language !== "english" &&
      input.engagement.interpretationProvided === undefined
    )
      context.addIssue({
        code: "custom",
        path: ["engagement", "interpretationProvided"],
        message: "Interpretation arrangements are required for French delivery",
      });
    if (
      input.capacity === "unsure" &&
      (!input.capacityContext || !input.capacityFunding)
    )
      context.addIssue({
        code: "custom",
        path: ["capacityContext"],
        message: "Clarifying answers are required when capacity is unsure",
      });
    if (input.ask.objective.split(/\s+/u).filter(Boolean).length > 200)
      context.addIssue({
        code: "custom",
        path: ["ask", "objective"],
        message: "Objective must not exceed 200 words",
      });
  });

export type EngagementRequestInput = z.infer<
  typeof engagementRequestInputSchema
>;
export type RequestFlag = Readonly<{
  flagId: string;
  type:
    | "conflict"
    | "lead_time"
    | "unverified"
    | "clash"
    | "sensitivity"
    | "repeat_requester";
  severity: "notice" | "review" | "blocking";
  detail: string;
  raisedAt: Date;
  clearedAt?: Date;
  clearedBy?: string;
  clearanceReason?: string;
}>;
export type RequestEvent = Readonly<{
  eventId: string;
  requestId: string;
  category: "action" | "access";
  fromState: RequestState | null;
  toState: RequestState;
  actorId: string;
  actorRole: Role | "system";
  reason: string;
  occurredAt: Date;
}>;
export type RequestNote = Readonly<{
  noteId: string;
  requestId: string;
  body: string;
  authorId: string;
  authorRole: "principal" | "desk_officer";
  createdAt: Date;
}>;
export type EngagementRequest = Readonly<
  EngagementRequestInput & {
    requestId: string;
    reference: string;
    state: RequestState;
    capacity: EngagementRequestInput["capacity"];
    capacityAssessment: CapacityAssessment;
    flags: readonly RequestFlag[];
    triageScore?: number;
    triageAssessment?: TriageAssessment;
    assignedTo?: string;
    assignedAt?: Date;
    assignedBy?: string;
    protocolNoteConfiguration?: ProtocolNoteInput &
      Readonly<{ configuredAt: Date; configuredBy: string }>;
    createdAt: Date;
    updatedAt: Date;
  }
>;

const transitions: Readonly<Record<RequestState, readonly RequestState[]>> = {
  received: ["screened"],
  screened: ["awaiting_decision"],
  awaiting_decision: ["info_requested", "held", "accepted", "declined"],
  info_requested: ["awaiting_decision", "lapsed"],
  held: ["accepted", "declined", "lapsed"],
  accepted: ["contracted"],
  contracted: ["delivered"],
  delivered: ["archived"],
  declined: [],
  lapsed: [],
  archived: [],
};

export function nextRequestStates(
  state: RequestState,
): readonly RequestState[] {
  return transitions[state];
}

export function createRequest(
  input: unknown,
  sequence: number,
  now = new Date(),
): Readonly<{ request: EngagementRequest; event: RequestEvent }> {
  const parsed = engagementRequestInputSchema.parse(input);
  const requestId = randomUUID();
  const reference = `PD-${now.getUTCFullYear()}-${sequence.toString().padStart(4, "0")}`;
  const capacityAssessment = classifyCapacity({
    capacity: parsed.capacity,
    ...(parsed.capacityContext ? { context: parsed.capacityContext } : {}),
    ...(parsed.capacityFunding ? { funding: parsed.capacityFunding } : {}),
  });
  const request: EngagementRequest = {
    ...parsed,
    requestId,
    reference,
    state: "received",
    capacityAssessment,
    flags: [],
    createdAt: now,
    updatedAt: now,
  };
  return {
    request,
    event: {
      eventId: randomUUID(),
      requestId,
      category: "action",
      fromState: null,
      toState: "received",
      actorId: "public-intake",
      actorRole: "system",
      reason: "Request submitted",
      occurredAt: now,
    },
  };
}

export function transitionRequest(
  request: EngagementRequest,
  toState: RequestState,
  actor: Readonly<{ id: string; roles: readonly Role[]; system?: boolean }>,
  reason: string,
  now = new Date(),
): Readonly<{ request: EngagementRequest; event: RequestEvent }> {
  if (!transitions[request.state].includes(toState))
    throw new Error(`Transition ${request.state} -> ${toState} is not allowed`);
  if (!reason.trim()) throw new Error("A transition reason is required");
  if (
    (toState === "accepted" || toState === "declined") &&
    !actor.roles.includes("principal")
  )
    throw new Error("Only the Principal can make a final decision");
  if (toState === "accepted" && request.capacity === "official")
    throw new Error(
      "The personal Protocol Desk cannot accept an official-capacity request",
    );
  if (
    toState === "delivered" &&
    now < (request.engagement.endsAt ?? request.engagement.startsAt)
  )
    throw new Error("An engagement cannot be delivered before it has ended");
  const unclearedConflict = request.flags.some(
    (flag) => flag.type === "conflict" && !flag.clearedAt,
  );
  if (toState === "accepted" && unclearedConflict)
    throw new Error(
      "A conflict flag requires recorded human clearance before acceptance",
    );
  const updated = { ...request, state: toState, updatedAt: now };
  return {
    request: updated,
    event: {
      eventId: randomUUID(),
      requestId: request.requestId,
      category: "action",
      fromState: request.state,
      toState,
      actorId: actor.id,
      actorRole: actor.system
        ? "system"
        : actor.roles.includes("principal")
          ? "principal"
          : "desk_officer",
      reason: reason.trim(),
      occurredAt: now,
    },
  };
}

export function screenRequest(
  request: EngagementRequest,
  context: TriageContext,
): Readonly<{ request: EngagementRequest; event: RequestEvent }> {
  if (request.state !== "received")
    throw new Error("Only a received request can be screened");
  const assessment = assessTriage(request, context);
  const transition = transitionRequest(
    {
      ...request,
      triageScore: assessment.score,
      triageAssessment: assessment,
      flags: assessment.flags,
    },
    "screened",
    { id: "triage-engine", roles: [], system: true },
    `Automated advisory screening completed with ${assessment.flags.length} flag(s)`,
    context.screenedAt,
  );
  return transition;
}

export function createRequestNote(
  requestId: string,
  body: string,
  actor: Readonly<{ id: string; roles: readonly Role[] }>,
  now = new Date(),
): RequestNote {
  const normalized = body.trim();
  if (!normalized || normalized.length > 4_000)
    throw new Error("A note must contain between 1 and 4000 characters");
  if (
    !actor.roles.includes("principal") &&
    !actor.roles.includes("desk_officer")
  )
    throw new Error("Only Protocol Desk operators can add notes");
  return {
    noteId: randomUUID(),
    requestId,
    body: normalized,
    authorId: actor.id,
    authorRole: actor.roles.includes("principal")
      ? "principal"
      : "desk_officer",
    createdAt: now,
  };
}

export function assignRequest(
  request: EngagementRequest,
  assigneeId: string,
  actor: Readonly<{ id: string; roles: readonly Role[] }>,
  now = new Date(),
): Readonly<{ request: EngagementRequest; event: RequestEvent }> {
  if (
    !actor.roles.includes("principal") &&
    !actor.roles.includes("desk_officer")
  )
    throw new Error("Only Protocol Desk operators can assign requests");
  const assignedTo = assigneeId.trim();
  if (!assignedTo || assignedTo.length > 128)
    throw new Error("Assignee identifier is invalid");
  const updated = {
    ...request,
    assignedTo,
    assignedAt: now,
    assignedBy: actor.id,
    updatedAt: now,
  };
  return {
    request: updated,
    event: {
      eventId: randomUUID(),
      requestId: request.requestId,
      category: "action",
      fromState: request.state,
      toState: request.state,
      actorId: actor.id,
      actorRole: actor.roles.includes("principal")
        ? "principal"
        : "desk_officer",
      reason: `Assigned to ${assignedTo}`,
      occurredAt: now,
    },
  };
}

export function clearRequestFlag(
  request: EngagementRequest,
  flagId: string,
  reason: string,
  actor: Readonly<{ id: string; roles: readonly Role[] }>,
  now = new Date(),
): Readonly<{ request: EngagementRequest; event: RequestEvent }> {
  if (
    !actor.roles.includes("principal") &&
    !actor.roles.includes("desk_officer")
  )
    throw new Error("Only Protocol Desk operators can clear flags");
  const clearanceReason = reason.trim();
  if (!clearanceReason || clearanceReason.length > 1000)
    throw new Error("A clearance reason is required");
  const index = request.flags.findIndex((flag) => flag.flagId === flagId);
  if (index < 0) throw new Error("Protocol Desk flag was not found");
  if (request.flags[index]!.clearedAt)
    throw new Error("Protocol Desk flag is already cleared");
  const flags = request.flags.map((flag, current) =>
    current === index
      ? { ...flag, clearedAt: now, clearedBy: actor.id, clearanceReason }
      : flag,
  );
  const updated = { ...request, flags, updatedAt: now };
  return {
    request: updated,
    event: {
      eventId: randomUUID(),
      requestId: request.requestId,
      category: "action",
      fromState: request.state,
      toState: request.state,
      actorId: actor.id,
      actorRole: actor.roles.includes("principal")
        ? "principal"
        : "desk_officer",
      reason: `Cleared ${request.flags[index]!.type} flag: ${clearanceReason}`,
      occurredAt: now,
    },
  };
}
