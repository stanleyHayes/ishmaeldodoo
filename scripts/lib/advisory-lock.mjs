import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export class AdvisoryLockError extends Error {
  constructor({ label, pid, requestedLabel, resource }) {
    super(
      `${resource} is in use by ${label} (pid ${pid}). ` +
        `Wait for it to finish before starting ${requestedLabel}.`,
    );
    this.name = "AdvisoryLockError";
  }
}

function holderIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readHolder(lockPath) {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf8"));
    return {
      pid: Number(parsed.pid),
      label: String(parsed.label || "an unnamed task"),
      token: String(parsed.token || ""),
    };
  } catch {
    return { pid: 0, label: "an invalid stale lock", token: "" };
  }
}

/**
 * Atomically reserves a shared local resource. The returned release callback
 * removes only the lock written by this holder, so delayed cleanup cannot
 * delete a replacement holder's lock.
 */
export function acquireAdvisoryLock({ lockPath, label, resource }) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const token = randomUUID();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor;
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, label, token }),
        "utf8",
      );
      closeSync(descriptor);
      descriptor = undefined;

      return () => {
        const holder = readHolder(lockPath);
        if (holder.pid === process.pid && holder.token === token)
          rmSync(lockPath, { force: true });
      };
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      if (error?.code !== "EEXIST") throw error;
      const holder = readHolder(lockPath);
      if (holderIsAlive(holder.pid))
        throw new AdvisoryLockError({
          ...holder,
          requestedLabel: label,
          resource,
        });
      rmSync(lockPath, { force: true });
    }
  }

  throw new Error(`Could not safely reserve ${resource}`);
}
