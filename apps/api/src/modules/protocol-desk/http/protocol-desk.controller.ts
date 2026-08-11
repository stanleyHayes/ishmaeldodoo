import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiAcceptedResponse, ApiTags } from "@nestjs/swagger";
import { ZodError } from "zod";
import { principalDecisionInputSchema } from "@amanor/contracts";
import { ProtocolDeskService } from "../application/protocol-desk.service";
import { ProtocolDeskRateLimitGuard } from "./protocol-desk-rate-limit.guard";

@ApiTags("protocol-desk")
@Controller("public/protocol-desk/requests")
export class ProtocolDeskController {
  constructor(private readonly desk: ProtocolDeskService) {}

  @Post()
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  @UseGuards(ProtocolDeskRateLimitGuard)
  @ApiAcceptedResponse({
    description:
      "The bilingual engagement request was durably received with an immediate reference.",
  })
  async submit(
    @Body() input: unknown,
  ): Promise<Readonly<{ reference: string; state: "received" }>> {
    try {
      return await this.desk.submit(input);
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          message: "Engagement request is invalid",
          issues: error.issues,
        });
      throw error;
    }
  }

  @Post("principal-decisions")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async decide(
    @Body() raw: unknown,
  ): Promise<Readonly<{ reference: string; state: string }>> {
    const input = principalDecisionInputSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Principal decision input is invalid");
    try {
      return await this.desk.decideWithCapability(input.data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Principal decision failed";
      throw new BadRequestException(message);
    }
  }
}
