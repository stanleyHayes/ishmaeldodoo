import { Body, Controller, Header, Post, Res, UseGuards } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { GeneratePressKitDto } from "./press-kit.dto";
import { PressKitService } from "./press-kit.service";
import { PressKitRateLimitGuard } from "./press-kit-rate-limit.guard";

@ApiTags("press-kit")
@Controller("public/press-kit")
export class PressKitController {
  constructor(private readonly pressKit: PressKitService) {}

  @Post()
  @UseGuards(PressKitRateLimitGuard)
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({
    description:
      "A personalised PDF or ZIP generated from the live published identity registry.",
  })
  async generate(
    @Body() input: GeneratePressKitDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.pressKit.generate(input);
    response.setHeader("Content-Type", result.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader("X-Press-Kit-Request-ID", result.requestId);
    response.status(201).send(result.body);
  }
}
