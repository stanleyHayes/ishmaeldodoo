const buckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;
const dynamicSegment = /^(?:[0-9]+|[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f-]{27})$/iu;

type Series = {
  count: number;
  sum: number;
  buckets: number[];
};

const escapeLabel = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');

export function normalizeMetricPath(path: string): string {
  const normalized = path
    .split("/")
    .map((segment) => (dynamicSegment.test(segment) ? ":id" : segment))
    .join("/");
  return normalized.length <= 160 ? normalized : "/overflow";
}

export class HttpMetrics {
  private readonly series = new Map<string, Series>();
  private readonly gauges = new Map<string, number>();

  observe(
    method: string,
    path: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = [
      method.toUpperCase(),
      normalizeMetricPath(path),
      `${Math.floor(statusCode / 100)}xx`,
    ];
    const key = JSON.stringify(labels);
    const current = this.series.get(key) ?? {
      count: 0,
      sum: 0,
      buckets: buckets.map(() => 0),
    };
    current.count += 1;
    current.sum += Math.max(0, durationSeconds);
    buckets.forEach((upperBound, index) => {
      if (durationSeconds <= upperBound) current.buckets[index]! += 1;
    });
    this.series.set(key, current);
  }

  render(): string {
    const lines = [
      "# HELP amanor_http_request_duration_seconds API request duration.",
      "# TYPE amanor_http_request_duration_seconds histogram",
    ];
    for (const [key, value] of [...this.series.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const [method, route, status] = JSON.parse(key) as [
        string,
        string,
        string,
      ];
      const base = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${status}"`;
      buckets.forEach((upperBound, index) =>
        lines.push(
          `amanor_http_request_duration_seconds_bucket{${base},le="${upperBound}"} ${value.buckets[index]}`,
        ),
      );
      lines.push(
        `amanor_http_request_duration_seconds_bucket{${base},le="+Inf"} ${value.count}`,
      );
      lines.push(
        `amanor_http_request_duration_seconds_sum{${base}} ${value.sum}`,
      );
      lines.push(
        `amanor_http_request_duration_seconds_count{${base}} ${value.count}`,
      );
    }
    for (const [series, value] of [...this.gauges.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    ))
      lines.push(`${series} ${value}`);
    return `${lines.join("\n")}\n`;
  }

  setGauge(
    name: string,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    if (!/^amanor_[a-z0-9_]+$/u.test(name))
      throw new Error("Metric gauge name is invalid");
    const labelText = Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}="${escapeLabel(item)}"`)
      .join(",");
    this.gauges.set(
      `${name}${labelText ? `{${labelText}}` : ""}`,
      Math.max(0, value),
    );
  }

  reset(): void {
    this.series.clear();
    this.gauges.clear();
  }
}

export const httpMetrics = new HttpMetrics();
