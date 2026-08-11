import { spawnSync } from "node:child_process";

const image = "amanor-api:verification";
const container = "amanor-api-verification";
const network = "infra_default";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  return String(result.stdout ?? "").trim();
}

function cleanup() {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}

cleanup();
try {
  run("docker", ["build", "-f", "apps/api/Dockerfile", "-t", image, "."], {
    stdio: "inherit",
  });
  run("docker", [
    "run",
    "-d",
    "--name",
    container,
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m,uid=1000,gid=1000",
    "--network",
    network,
    "-e",
    "NODE_ENV=test",
    "-e",
    "RUN_MIGRATIONS=false",
    "-e",
    "MONGODB_URI=mongodb://amanor_test_admin:amanor_test_admin_password@mongo-test:27017/amanor_container?authSource=admin&replicaSet=rs0&directConnection=true",
    image,
  ]);
  const deadline = Date.now() + 45_000;
  let health = "starting";
  while (Date.now() < deadline) {
    health = run("docker", [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
      container,
    ]);
    if (health === "healthy") break;
    if (health === "unhealthy")
      throw new Error(
        `API container became unhealthy\n${run("docker", ["logs", container])}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (health !== "healthy")
    throw new Error(`API container did not become healthy: ${health}`);
  const uid = run("docker", ["exec", container, "id", "-u"]);
  if (uid === "0") throw new Error("API container is running as root");
  const started = Date.now();
  run("docker", ["stop", "--time", "10", container]);
  const elapsed = Date.now() - started;
  const exitCode = run("docker", [
    "inspect",
    "--format",
    "{{.State.ExitCode}}",
    container,
  ]);
  if (exitCode !== "0")
    throw new Error(`API container exited with ${exitCode} after SIGTERM`);
  if (elapsed > 12_000)
    throw new Error(`API container exceeded shutdown bound: ${elapsed}ms`);
  process.stdout.write(
    `API container passed: healthy, uid=${uid}, SIGTERM exit=0 in ${elapsed}ms\n`,
  );
} finally {
  cleanup();
}
