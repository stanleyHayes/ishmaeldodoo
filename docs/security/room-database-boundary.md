# The Room database boundary

- Scope: AMANOR-094
- Status: engineering evidence complete; provider provisioning and independent Security review required
- Source: F13, brief sections 10.2 and 12.3, and `the-room-threat-model.md`

## Runtime boundary

The long-running API uses `MONGODB_URI`. The Room module uses the named `room` Mongoose connection and `ROOM_MONGODB_URI`. When `ROOM_ENABLED=true`, startup fails unless both URIs contain explicit, different usernames and explicit, different database names. Secrets remain in the deployment provider; they must never be printed, copied into release evidence or shared with another job.

The Room connection is not imported by the application root while F13 is disabled. AMANOR-095/096 may import `RoomDatabaseModule` only inside the Room bounded context. They must inject the named connection and use `RoomRepository`; direct general-purpose database access is forbidden.

## Provider grant manifest

Provision with a short-lived infrastructure identity that is unavailable to every runtime container. Replace the symbolic database names below in the provider's role mechanism:

| Identity     | Database / collection        | Allowed actions                                                  |
| ------------ | ---------------------------- | ---------------------------------------------------------------- |
| General API  | Application collections only | Explicit per-collection actions required by each bounded context |
| General API  | Entire Room database         | None                                                             |
| Room runtime | `room_enquiries`             | Find, insert, update and delete under the reviewed lifecycle     |
| Room runtime | `room_events`                | Find and insert only                                             |
| Room runtime | `room_key_manifests`         | Find only                                                        |
| Room runtime | Entire application database  | None                                                             |

Do not grant built-in database-wide `readWrite`, `read`, backup, cluster-monitoring or cross-database roles to either runtime identity. Key-manifest publication requires a separately reviewed one-shot identity; it is deliberately absent from the Room runtime grants.

## Required environment evidence

For preview, staging and production, Infrastructure records only the environment, redacted username IDs, database IDs, role revision, grant timestamp and reviewer. Before enabling intake, Security executes authenticated positive and negative queries equivalent to the replica test:

1. Each identity can perform its explicitly allowed action in its own database.
2. The application identity cannot find or insert any Room collection.
3. The Room identity cannot find or insert any application collection.
4. The Room identity cannot address unlisted collections in its own database.
5. `room_events` rejects update and delete.
6. Migration, retention, reporting and backup-inspection identities cannot read the Room database.

The evidence must contain no URI, password, ciphertext, public/private key, submission reference or personal data. A failed check keeps `ROOM_ENABLED=false`.

## Remaining launch gates

This boundary does not approve the encryption suite, key custody, decrypting client, retention/backup policy or production access. AMANOR-093 and AMANOR-096 remain gated by the approvals in the threat model. Production additionally requires provider grant evidence, ciphertext-only inspection, deletion/restore reconciliation, key-loss recovery and the independent penetration test.
