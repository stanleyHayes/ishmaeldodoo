const groupKey = (event, dimensions) =>
  dimensions.map((dimension) => event[dimension] ?? "unset").join("|");

const matchesRouteFilter = (event, routes) =>
  !routes?.length || routes.includes(event.route);

export function evaluateAnalyticsPanel(panel, events) {
  const relevant = events.filter(
    (event) =>
      panel.events.includes(event.name) &&
      matchesRouteFilter(event, panel.routeFilter),
  );
  const groups = new Map();

  for (const event of relevant) {
    const key = groupKey(event, panel.groupBy ?? []);
    const current = groups.get(key) ?? [];
    current.push(event);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, groupedEvents]) => {
    const counts = Object.fromEntries(
      panel.events.map((name) => [
        name,
        groupedEvents.filter((event) => event.name === name).length,
      ]),
    );
    const total = groupedEvents.length;
    const suppressed = total < panel.minimumGroupSize;
    let value = null;

    if (!suppressed) {
      if (panel.measure === "count") value = total;
      if (panel.measure === "count_by_event") value = counts;
      if (panel.measure === "completed_divided_by_started") {
        const started = counts.protocol_desk_started ?? 0;
        value = started
          ? (counts.protocol_desk_completed ?? 0) / started
          : (panel.zeroDenominator ?? null);
      }
      if (panel.measure === "activation_count_and_sahel_share") {
        const pageviews = counts.pageview ?? 0;
        const sahelPageviews = groupedEvents.filter(
          (event) => event.name === "pageview" && event.mode === "sahel",
        ).length;
        value = {
          activations: counts.sahel_mode_enabled ?? 0,
          sahelShare: pageviews
            ? sahelPageviews / pageviews
            : (panel.zeroDenominator ?? null),
        };
      }
    }

    return { key, count: total, suppressed, value };
  });
}
