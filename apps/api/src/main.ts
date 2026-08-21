import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { createOpenApiDocument } from "./openapi";
import { requestContextMiddleware } from "./common/request-context";
import { configureRequestBodyLimits } from "./common/request-body-limits";
import { UnsafeInputPipe } from "./common/unsafe-input.pipe";
import { exactCorsOrigin } from "./common/exact-cors-origin";
import { configureTelemetry } from "./common/telemetry";

async function bootstrap(): Promise<void> {
  const tlsPrivateKey = process.env.API_TLS_PRIVATE_KEY_PEM;
  const tlsCertificate = process.env.API_TLS_CERTIFICATE_PEM;
  if (Boolean(tlsPrivateKey) !== Boolean(tlsCertificate))
    throw new Error(
      "API TLS private key and certificate must be configured together",
    );
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
    ...(tlsPrivateKey && tlsCertificate
      ? { httpsOptions: { key: tlsPrivateKey, cert: tlsCertificate } }
      : {}),
  });
  configureRequestBodyLimits(app);
  const configuration = app.get(ConfigService);
  const adminOrigin = configuration.getOrThrow<string>("ADMIN_ORIGIN");
  const port = configuration.get<number>("PORT", 4000);
  const trustProxyHops = configuration.get<number>("TRUST_PROXY_HOPS", 0);
  const telemetryEndpoint = configuration.get<string>(
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  );
  const shutdownTelemetry = configureTelemetry({
    ...(telemetryEndpoint ? { endpoint: telemetryEndpoint } : {}),
    sampleRatio: Number(configuration.get("OTEL_TRACE_SAMPLE_RATIO", "0.1")),
    serviceVersion: process.env.npm_package_version ?? "unknown",
  });

  app.setGlobalPrefix("v1");
  app.set("trust proxy", trustProxyHops);
  app.enableShutdownHooks();
  app.enableCors({
    origin: exactCorsOrigin(adminOrigin),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-CSRF-Token",
      "X-Request-ID",
      "traceparent",
    ],
    exposedHeaders: ["X-Request-ID", "traceparent"],
    // Cache preflights in production, but never in development: a cached
    // preflight with a stale allowed-origin survives config changes and blocks
    // local work until it expires, which a hard refresh cannot clear.
    maxAge: process.env.NODE_ENV === "production" ? 600 : 0,
  });
  app.use(helmet());
  app.use(requestContextMiddleware);
  app.use(cookieParser());
  app.useGlobalPipes(
    new UnsafeInputPipe(),
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  SwaggerModule.setup("v1/docs", app, createOpenApiDocument(app));

  await app.listen(port, "0.0.0.0");
  const shutdown = (): void => {
    void shutdownTelemetry().catch(() => {
      process.stderr.write("Telemetry shutdown did not complete cleanly\n");
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

bootstrap().catch((error: unknown) => {
  // A startup failure (bad config, port bind, or an onApplicationBootstrap hook
  // such as migrations/index creation throwing) must be logged and turn into a
  // deterministic non-zero exit, so the orchestrator restarts instead of leaving
  // a half-initialised process that a shallow port check could read as healthy.
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`API failed to start: ${detail}\n`);
  process.exit(1);
});
