import { Inject, Injectable } from "@nestjs/common";
import { engagementRequestInputSchema } from "../domain/engagement-request";
import { ProtocolDeskRepository } from "../persistence/protocol-desk.repository";
import type {
  ProtocolDeskQueuePage,
  ProtocolDeskQueueQuery,
  ProtocolDeskRequestDetail,
} from "@amanor/contracts";
import { hasPermission, type Role } from "../../auth/domain/roles";
import type { RequestState } from "../domain/engagement-request";
import type { ProtocolNoteInput } from "@amanor/contracts";
import { AvailabilityService } from "./availability.service";
import { TriageContextService } from "./triage-context.service";
import type { PrincipalDecisionAction } from "../domain/decision-capability";

@Injectable()
export class ProtocolDeskService {
  constructor(
    @Inject(ProtocolDeskRepository)
    private readonly repository: ProtocolDeskRepository,
    @Inject(AvailabilityService)
    private readonly availability: AvailabilityService,
    @Inject(TriageContextService)
    private readonly triageContext: TriageContextService,
  ) {}

  async submit(
    input: unknown,
  ): Promise<Readonly<{ reference: string; state: "received" }>> {
    const parsed = engagementRequestInputSchema.parse(input);
    const context = await this.triageContext.forSubmission(parsed);
    const request = await this.repository.create(parsed, undefined, context);
    return { reference: request.reference, state: "received" };
  }

  async queue(
    query: ProtocolDeskQueueQuery,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskQueuePage> {
    this.assertOperator(actor.roles);
    const page = await this.repository.listQueue(query);
    await this.repository.recordQueueAccess(page.items, actor);
    return page;
  }

  async detail(
    requestId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail | null> {
    this.assertOperator(actor.roles);
    if (
      !(await this.repository.recordAccess(
        requestId,
        actor,
        "Request detail viewed",
      ))
    )
      return null;
    return this.repository.detail(requestId);
  }
  async assign(
    requestId: string,
    assigneeId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.assign(requestId, assigneeId, actor);
    return this.requiredDetail(requestId);
  }
  async addNote(
    requestId: string,
    body: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.addNote(requestId, body, actor);
    return this.requiredDetail(requestId);
  }
  async transition(
    requestId: string,
    state: RequestState,
    reason: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
    declineCategory?: "capacity" | "fit" | "conflict",
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    if (state === "accepted") {
      const current = await this.repository.findRequest(requestId);
      if (!current) throw new Error("Protocol Desk request was not found");
      const conflicts = await this.availability.conflicts({
        startsAt: current.engagement.startsAt,
        endsAt:
          current.engagement.endsAt ??
          new Date(current.engagement.startsAt.getTime() + 2 * 60 * 60 * 1_000),
        excludeRequestId: requestId,
      });
      if (conflicts.length)
        throw new Error("Requested engagement interval is unavailable");
    }
    await this.repository.transition(
      requestId,
      state,
      actor,
      reason,
      declineCategory,
    );
    return this.requiredDetail(requestId);
  }
  async clearFlag(
    requestId: string,
    flagId: string,
    reason: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.clearFlag(requestId, flagId, reason, actor);
    return this.requiredDetail(requestId);
  }
  async retryCorrespondence(
    requestId: string,
    correspondenceId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.retryCorrespondence(
      requestId,
      correspondenceId,
      actor,
    );
    return this.requiredDetail(requestId);
  }
  async retryCalendarSync(
    requestId: string,
    syncId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.retryCalendarSync(requestId, syncId, actor);
    return this.requiredDetail(requestId);
  }
  async retryPrincipalDecisionDelivery(
    requestId: string,
    deliveryId: string,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.retryPrincipalDecisionDelivery(
      requestId,
      deliveryId,
      actor,
    );
    return this.requiredDetail(requestId);
  }
  async configureProtocolNote(
    requestId: string,
    input: ProtocolNoteInput,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOperator(actor.roles);
    await this.repository.configureProtocolNote(requestId, input, actor);
    return this.requiredDetail(requestId);
  }

  async issuePrincipalDecisionCapability(
    requestId: string,
    action: PrincipalDecisionAction,
    actor: Readonly<{ id: string; roles: readonly Role[] }>,
  ): Promise<Readonly<{ token: string; expiresAt: Date }>> {
    return this.repository.issuePrincipalDecisionCapability(
      requestId,
      action,
      actor,
    );
  }

  async decideWithCapability(
    input: Readonly<{
      token: string;
      action: PrincipalDecisionAction;
      reason: string;
      declineCategory?: "capacity" | "fit" | "conflict" | undefined;
    }>,
  ): Promise<Readonly<{ reference: string; state: RequestState }>> {
    if (input.action === "accept") {
      const current = await this.repository.requestForDecisionCapability(
        input.token,
        input.action,
      );
      if (!current)
        throw new Error("Decision link is invalid, expired, or already used");
      const conflicts = await this.availability.conflicts({
        startsAt: current.engagement.startsAt,
        endsAt:
          current.engagement.endsAt ??
          new Date(current.engagement.startsAt.getTime() + 2 * 60 * 60 * 1_000),
        excludeRequestId: current.requestId,
      });
      if (conflicts.length)
        throw new Error("Requested engagement interval is unavailable");
    }
    return this.repository.consumePrincipalDecisionCapability(
      input.token,
      input.action,
      input.reason,
      input.declineCategory,
    );
  }

  private assertOperator(roles: readonly Role[]): void {
    if (!hasPermission(roles, "desk:operate"))
      throw new Error("Protocol Desk operator role is required");
  }
  private async requiredDetail(
    requestId: string,
  ): Promise<ProtocolDeskRequestDetail> {
    const detail = await this.repository.detail(requestId);
    if (!detail) throw new Error("Protocol Desk request was not found");
    return detail;
  }
}
