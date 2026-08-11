const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function disposableMongoUri(
  baseUri: string,
  databaseName: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUri);
  } catch {
    throw new Error("MONGODB_TEST_URI must be a valid MongoDB URI");
  }
  if (parsed.protocol !== "mongodb:")
    throw new Error("MONGODB_TEST_URI must use the mongodb protocol");
  if (!loopbackHosts.has(parsed.hostname))
    throw new Error("MONGODB_TEST_URI must target a loopback host");
  if (parsed.pathname !== "" && parsed.pathname !== "/")
    throw new Error("MONGODB_TEST_URI must not select an existing database");
  if (!/^amanor_(?:app|integration)_[a-f0-9]{32}$/u.test(databaseName))
    throw new Error("Integration database name is not disposable");

  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.set("authSource", "admin");
  parsed.searchParams.set("replicaSet", "rs0");
  parsed.searchParams.set("directConnection", "true");
  return parsed.toString();
}
