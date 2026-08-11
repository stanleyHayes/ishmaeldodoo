import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mergeMap, type Observable } from "rxjs";
import { AuthRepository } from "../modules/auth/persistence/auth.repository";
import type { AuthenticatedRequest } from "../modules/auth/http/authenticated-request";

@Injectable()
export class PrivilegedReadAuditInterceptor implements NestInterceptor {
  constructor(private readonly repository: AuthRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest> & { method?: string }>();
    const response = next.handle() as Observable<unknown>;
    if (request.method !== "GET" || !request.auth) return response;

    const operation = `${context.getClass().name}.${context.getHandler().name}`;
    return response.pipe(
      mergeMap(async (value) => {
        await this.repository.appendEvent({
          eventId: randomUUID(),
          type: "privileged_data_read",
          actorId: request.auth!.subject,
          occurredAt: new Date(),
          outcome: "success",
          reason: operation,
        });
        return value;
      }),
    );
  }
}
