import { cp, mkdir, readFile } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import process from "node:process";

const [app, rawPort, protocol = "http"] = process.argv.slice(2);
if (!new Set(["web", "admin"]).has(app) || !/^\d+$/u.test(rawPort ?? ""))
  throw new Error(
    "Usage: node scripts/start-next-e2e.mjs <web|admin> <port> [http|https]",
  );
if (!new Set(["http", "https"]).has(protocol))
  throw new Error("E2E Next protocol must be http or https");

const standalone = `apps/${app}/.next/standalone`;
const runtimeApp = `${standalone}/apps/${app}`;
await mkdir(`${runtimeApp}/.next`, { recursive: true });
await cp(`apps/${app}/.next/static`, `${runtimeApp}/.next/static`, {
  recursive: true,
  force: true,
});
await cp(`apps/${app}/public`, `${runtimeApp}/public`, {
  recursive: true,
  force: true,
}).catch(() => undefined);

const externalPort = Number(rawPort);
const internalPort = protocol === "https" ? externalPort + 100 : externalPort;
const child = spawn("node", [`apps/${app}/server.js`], {
  cwd: standalone,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(internalPort),
  },
  stdio: "inherit",
});

let proxy;
if (protocol === "https") {
  const [key, cert] = await Promise.all([
    readFile("tmp/e2e-tls/localhost-key.pem"),
    readFile("tmp/e2e-tls/localhost-cert.pem"),
  ]);
  proxy = createHttpsServer({ key, cert }, (incoming, outgoing) => {
    const externalOrigin = `https://localhost:${externalPort}`;
    const internalOrigin = `https://localhost:${internalPort}`;
    const forwardedHeaders = {
      ...incoming.headers,
      host: incoming.headers.host ?? `localhost:${externalPort}`,
      "x-forwarded-host": incoming.headers.host ?? `localhost:${externalPort}`,
      "x-forwarded-port": String(externalPort),
      "x-forwarded-proto": "https",
    };
    if (forwardedHeaders.origin === externalOrigin)
      forwardedHeaders.origin = internalOrigin;
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: internalPort,
        method: incoming.method,
        path: incoming.url,
        headers: forwardedHeaders,
      },
      (response) => {
        const responseHeaders = { ...response.headers };
        if (typeof responseHeaders.location === "string")
          responseHeaders.location = responseHeaders.location.replace(
            internalOrigin,
            externalOrigin,
          );
        outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  proxy.listen(externalPort, "127.0.0.1");
}

function shutdown(signal) {
  proxy?.close();
  if (!child.killed) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => shutdown(signal));
child.on("exit", (code, signal) => {
  proxy?.close();
  process.exitCode = code ?? (signal ? 1 : 0);
});
