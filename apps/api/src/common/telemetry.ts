import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";
import { parseTraceParent } from "./trace-context";
import { httpMetrics } from "./http-metrics";

const instrumentationName = "amanor-api-http";
const serviceName = "amanor-api";
const discardProvider = new NodeTracerProvider();
let provider: NodeTracerProvider = discardProvider;
let tracer: Tracer = provider.getTracer(instrumentationName);

export type TelemetryConfiguration = Readonly<{
  endpoint?: string;
  exporter?: SpanExporter;
  sampleRatio: number;
  serviceVersion: string;
}>;

export class HealthTrackedSpanExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    try {
      this.delegate.export(spans, (result) => {
        httpMetrics.setGauge(
          "amanor_telemetry_export_healthy",
          result.code === ExportResultCode.SUCCESS ? 1 : 0,
        );
        resultCallback(result);
      });
    } catch (error) {
      httpMetrics.setGauge("amanor_telemetry_export_healthy", 0);
      resultCallback({
        code: ExportResultCode.FAILED,
        error:
          error instanceof Error ? error : new Error("Trace export failed"),
      });
    }
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush?.();
  }
}

export function configureTelemetry(
  configuration: TelemetryConfiguration,
): () => Promise<void> {
  if (!configuration.endpoint && !configuration.exporter) {
    httpMetrics.setGauge("amanor_telemetry_export_configured", 0);
    httpMetrics.setGauge("amanor_telemetry_export_healthy", 0);
    return () => Promise.resolve();
  }

  httpMetrics.setGauge("amanor_telemetry_export_configured", 1);
  httpMetrics.setGauge("amanor_telemetry_export_healthy", 1);

  const exporter = configuration.exporter
    ? configuration.exporter
    : new OTLPTraceExporter({
        url: configuration.endpoint!,
        timeoutMillis: 3_000,
      });
  const healthTrackedExporter = new HealthTrackedSpanExporter(exporter);
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: configuration.serviceVersion,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(configuration.sampleRatio),
    }),
    spanProcessors: configuration.exporter
      ? [new SimpleSpanProcessor(healthTrackedExporter)]
      : [
          new BatchSpanProcessor(healthTrackedExporter, {
            maxQueueSize: 512,
            maxExportBatchSize: 64,
            scheduledDelayMillis: 1_000,
            exportTimeoutMillis: 3_000,
          }),
        ],
  });
  tracer = provider.getTracer(instrumentationName);
  return () => provider.shutdown();
}

export function startHttpServerSpan(
  method: string,
  normalizedPath: string,
  incomingTraceparent: unknown,
): Span {
  const parent = parseTraceParent(incomingTraceparent);
  const parentContext = parent
    ? trace.setSpanContext(ROOT_CONTEXT, {
        traceId: parent.traceId,
        spanId: parent.spanId,
        traceFlags:
          Number.parseInt(parent.traceFlags, 16) & 1
            ? TraceFlags.SAMPLED
            : TraceFlags.NONE,
        isRemote: true,
      })
    : ROOT_CONTEXT;
  return tracer.startSpan(
    `${method.toUpperCase()} ${normalizedPath}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        [ATTR_HTTP_REQUEST_METHOD]: method.toUpperCase(),
        [ATTR_URL_PATH]: normalizedPath,
      },
    },
    parentContext,
  );
}

export function finishHttpServerSpan(span: Span, statusCode: number): void {
  span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
  if (statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}

export function traceparentForSpan(span: Span): string {
  const context = span.spanContext();
  const flags = context.traceFlags & TraceFlags.SAMPLED ? "01" : "00";
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}
