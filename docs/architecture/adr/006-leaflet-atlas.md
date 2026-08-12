# ADR-006: Leaflet Atlas

- Status: Accepted library; tile provider pending
- Date: 9 August 2026

## Decision

Use Leaflet as a progressively enhanced view of the Atlas dataset. The server-rendered, sortable and filterable table is the semantic source and fully supports keyboard/screen-reader use. The map loads only after consent-free capability checks and user/network conditions allow it. Lite Mode renders the table by default and offers an explicit map opt-in.

Atlas records store coordinates only when the source is precise and publication-safe; otherwise region geometry/centroids are labelled as approximate. Leaflet code, CSS and tiles are isolated from non-Atlas routes. Marker clustering/virtualisation is considered only after profiling the launch set of at most 60 nodes.

A tile-provider decision must cover attribution, Ghana/Africa latency, privacy, request logging, rate limits, caching rights, visual treatment and outage behaviour. Provider keys are origin-restricted where supported. Tile failure never removes the table or filters.

## Verification

Test table/map filter parity, focus order, screen-reader labels, no-map and tile-outage paths, 2G/Lite behaviour, reduced motion, mobile gestures, attribution and the 2.5-second Atlas interaction budget on target hardware.
