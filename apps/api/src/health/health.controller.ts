import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import mongoose, { type Connection } from "mongoose";

type HealthResponse = Readonly<{
  status: "ok";
  service: "amanor-api";
  timestamp: string;
}>;

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {}

  @Get("live")
  @ApiOkResponse({ description: "The NestJS process is alive." })
  live(): HealthResponse {
    return {
      status: "ok",
      service: "amanor-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  @ApiOkResponse({ description: "The API is ready for traffic." })
  ready(): HealthResponse {
    // Fail closed: an absent OR not-yet-connected database connection means the
    // instance is not ready for traffic. Returning 200 here would let the
    // platform (Render healthCheckPath=/v1/health/ready) route requests to an
    // instance that cannot reach MongoDB.
    if (
      !this.connection ||
      this.connection.readyState !== mongoose.ConnectionStates.connected
    ) {
      throw new ServiceUnavailableException("API dependencies are not ready");
    }
    return {
      status: "ok",
      service: "amanor-api",
      timestamp: new Date().toISOString(),
    };
  }
}
