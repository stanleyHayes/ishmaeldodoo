import { randomUUID } from "node:crypto";
import {
  protocolDeskCorrespondenceTemplates,
  type ProtocolDeskTransitionInput,
} from "@amanor/contracts";
import type { EngagementRequest, RequestState } from "./engagement-request";

export type CorrespondenceTemplate =
  (typeof protocolDeskCorrespondenceTemplates)[number];
export type CorrespondenceStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "cancelled";
export type CorrespondenceJob = Readonly<{
  correspondenceId: string;
  requestId: string;
  reference: string;
  template: CorrespondenceTemplate;
  locale: "en-GB" | "fr-FR";
  recipient: string;
  status: CorrespondenceStatus;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  lockedAt?: Date;
  deliveredAt?: Date;
  providerMessageId?: string;
  lastError?: string;
}>;

export function createCorrespondence(
  request: EngagementRequest,
  template: CorrespondenceTemplate,
  now: Date,
  delayMs = 0,
): CorrespondenceJob {
  return {
    correspondenceId: randomUUID(),
    requestId: request.requestId,
    reference: request.reference,
    template,
    locale: request.locale,
    recipient: request.requester.email,
    status: "pending",
    attempts: 0,
    availableAt: new Date(now.getTime() + delayMs),
    createdAt: now,
  };
}

export function submissionCorrespondence(
  request: EngagementRequest,
  now: Date,
): readonly CorrespondenceJob[] {
  return [
    createCorrespondence(request, "acknowledgement", now),
    createCorrespondence(request, "status-update", now, 48 * 60 * 60 * 1000),
  ];
}

export function transitionCorrespondence(
  request: EngagementRequest,
  transition: Pick<ProtocolDeskTransitionInput, "state" | "declineCategory">,
  now: Date,
): readonly CorrespondenceJob[] {
  const template = templateForTransition(
    transition.state,
    transition.declineCategory,
  );
  if (!template) return [];
  return [
    createCorrespondence(
      request,
      template,
      now,
      transition.state === "delivered" ? 3 * 24 * 60 * 60 * 1000 : 0,
    ),
  ];
}

function templateForTransition(
  state: RequestState,
  declineCategory?: ProtocolDeskTransitionInput["declineCategory"],
): CorrespondenceTemplate | undefined {
  if (state === "info_requested") return "information-request";
  if (state === "held") return "hold-placed";
  if (state === "accepted") return "acceptance";
  if (state === "delivered") return "follow-up";
  if (state === "declined" && declineCategory)
    return `decline-${declineCategory}`;
  return undefined;
}

export function shouldCancelScheduledJob(
  template: CorrespondenceTemplate,
  currentState: RequestState,
): boolean {
  return (
    template === "status-update" &&
    !["received", "screened", "awaiting_decision"].includes(currentState)
  );
}

const tokenPattern = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/gu;
export function renderCorrespondenceTemplate(
  source: Readonly<{
    subject: string;
    bodyText: string;
    bodyHtml: string;
    allowedVariables: readonly string[];
  }>,
  values: Readonly<Record<string, string>>,
): Readonly<{ subject: string; text: string; html: string }> {
  const allowed = new Set(source.allowedVariables);
  const render = (value: string, html: boolean): string =>
    value.replace(tokenPattern, (_token, key: string) => {
      if (!allowed.has(key) || values[key] === undefined)
        throw new Error(`Correspondence variable ${key} is unavailable`);
      return html ? escapeHtml(values[key]) : values[key];
    });
  const rendered = {
    subject: render(source.subject, false),
    text: render(source.bodyText, false),
    html: render(source.bodyHtml, true),
  };
  if (tokenPattern.test(`${rendered.subject}${rendered.text}${rendered.html}`))
    throw new Error("Correspondence contains unresolved variables");
  return rendered;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
