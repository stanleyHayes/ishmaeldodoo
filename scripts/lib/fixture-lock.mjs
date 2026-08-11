import { resolve } from "node:path";
import { acquireAdvisoryLock, AdvisoryLockError } from "./advisory-lock.mjs";

/**
 * A single advisory lock over the shared MongoDB fixture in
 * `infra/docker-compose.test.yml`.
 *
 * Every tool that drives that compose project uses the same project name, the
 * same container and the same host port, and each one calls `down` to get a
 * clean start. Two of them running at once therefore destroy each other's
 * database mid-flight. The victim does not fail cleanly: it reports
 * `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27028`, or a wave
 * of timing-out browser journeys, or `Replication is being shut down` — all of
 * which read as product defects and none of which are. That misdiagnosis is the
 * expensive part, so the lock exists to turn it into one clear message.
 *
 * The lock records a PID and a label. A holder that died without releasing is
 * reclaimed, so a killed run never blocks the next one permanently.
 */
const LOCK_PATH = resolve("tmp/mongo-fixture.lock");
let release;

/**
 * Takes the lock, or exits with a message naming the current holder. Exiting
 * rather than throwing is deliberate: every caller is a top-level script whose
 * only sensible response is to stop before touching the fixture.
 */
export function acquireFixtureLock(label) {
  try {
    release = acquireAdvisoryLock({
      lockPath: LOCK_PATH,
      label,
      resource: "The shared MongoDB test fixture",
    });
  } catch (error) {
    if (!(error instanceof AdvisoryLockError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

export function releaseFixtureLock() {
  release?.();
  release = undefined;
}
