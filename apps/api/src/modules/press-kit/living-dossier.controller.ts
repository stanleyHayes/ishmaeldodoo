import { Body, Controller, Header, Post, Res, UseGuards } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { GenerateLivingDossierDto } from "./living-dossier.dto";
import { LivingDossierService } from "./living-dossier.service";
import { PressKitRateLimitGuard } from "./press-kit-rate-limit.guard";

@ApiTags("living-dossier")
@Controller("public/living-dossier")
export class LivingDossierController {
  constructor(private readonly dossiers: LivingDossierService) {}

  @Post()
  @UseGuards(PressKitRateLimitGuard)
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({
    description:
      "A personalised, watermarked PDF assembled from current published CMS records.",
  })
  async generate(
    @Body() input: GenerateLivingDossierDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.dossiers.generate(input);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader("X-Dossier-Reference", result.requestId);
    response.status(201).send(result.body);
  }
}
