import {
  ConflictException,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { PublicServiceGuard } from "../../../common/public-service.guard";
import { RevalidationClaimRepository } from "../persistence/revalidation-claim.repository";

@ApiTags("internal-revalidation")
@Controller("internal/revalidation/claims")
@UseGuards(PublicServiceGuard)
export class RevalidationClaimController {
  constructor(private readonly claims: RevalidationClaimRepository) {}

  @Post(":idempotencyKey")
  @HttpCode(201)
  @ApiCreatedResponse({
    description: "Atomically claims a revalidation idempotency key.",
  })
  async claim(
    @Param("idempotencyKey") idempotencyKey: string,
  ): Promise<{ claimed: true }> {
    if (
      !/^[a-zA-Z0-9:_-]{1,256}$/u.test(idempotencyKey) ||
      !(await this.claims.claim(idempotencyKey))
    )
      throw new ConflictException("Revalidation delivery was already claimed");
    return { claimed: true };
  }
}
