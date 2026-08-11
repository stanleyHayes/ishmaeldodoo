import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { httpMetrics } from "../common/http-metrics";

@ApiExcludeController()
@Controller("internal/metrics")
export class MetricsController {
  constructor(private readonly configuration: ConfigService) {}

  @Get()
  scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res() response: Response,
  ): void {
    const expected = this.configuration.get<string>("METRICS_BEARER_TOKEN");
    const supplied = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (!expected || !this.matches(supplied, expected))
      throw new NotFoundException();
    response
      .type("text/plain; version=0.0.4; charset=utf-8")
      .send(httpMetrics.render());
  }

  private matches(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }
}
