# Privileged access audit

- Status: Engineering control implemented; retention and independent review pending
- Scope: Successful authenticated `GET` operations in the NestJS API
- Owner: Security administrator

## Coverage

The global NestJS interceptor runs after authentication guards and before a successful private response is released. It therefore covers authenticated reads in:

- authentication administration: sessions, users and security evidence;
- CMS: versions, editorial history, integrity, collection listings and source audit;
- media administration: governed library and asset inventory;
- Protocol Desk: queue, operations, availability and request detail.

Protocol Desk queue/detail reads also retain request-scoped access events because the build brief requires a per-request history of who saw each request.

Public projections, public forms, health probes and service-authenticated internal operations have no administrator claims and are not written to this human privileged-access trail.

## Data-minimisation contract

Each successful privileged read records only:

- a random event identifier;
- `privileged_data_read`;
- the authenticated opaque actor identifier;
- a stable `Controller.handler` operation identifier;
- success and server timestamp;
- integrity-chain sequence and hashes added inside the repository transaction.

The interceptor must never copy URL parameters, query strings, request or response bodies, IP addresses, user-agent values, cookies, tokens, email addresses or session identifiers. Failed reads are not falsely recorded as successful; authentication failures remain in the authentication security events. If the audit append fails, the private response fails closed.

## Integrity and review

Events use the existing transactionally maintained authentication/security hash chain. Security administrators review the redacted combined security and data-access history and its live integrity result in Admin. The public API and public web cannot read this collection.

Automated checks prove registration, minimisation, fail-closed behavior, chain integrity and Admin presentation. Production completion still requires:

- approved retention and erasure interaction from Legal/Privacy;
- provider database privileges that prevent update/delete outside controlled administration;
- production-like concurrency and outage rehearsal;
- independent Security/Privacy review and signed evidence.
