import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}>;

@Injectable()
export class RateLimitService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  async consume(
    scope: string,
    identifier: string,
    limit: number,
    windowMilliseconds: number,
    now = new Date(),
  ): Promise<RateLimitDecision> {
    if (!this.connection.db)
      throw new Error("Rate limiter database is unavailable");
    const pepper =
      this.configuration.get<string>("RATE_LIMIT_PEPPER") ??
      this.configuration.get<string>("SESSION_PEPPER") ??
      "amanor-development-rate-limit-pepper";
    const key = createHmac("sha256", pepper)
      .update(`${scope}:${identifier}`)
      .digest("hex");
    const windowStartMilliseconds =
      Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds;
    const windowStart = new Date(windowStartMilliseconds);
    const expiresAt = new Date(
      windowStartMilliseconds + windowMilliseconds * 2,
    );
    const record = await this.connection.db
      .collection<{
        key: string;
        windowStart: Date;
        count: number;
        expiresAt: Date;
      }>("rate_limits")
      .findOneAndUpdate(
        { key, windowStart },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, returnDocument: "after" },
      );
    const count = record?.count ?? 1;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (windowStartMilliseconds + windowMilliseconds - now.getTime()) /
            1_000,
        ),
      ),
    };
  }
}
