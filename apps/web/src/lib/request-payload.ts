export async function requestPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data")
  ) {
    const form = await request.formData();
    const entries: Array<readonly [string, string]> = [];
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string") throw new Error("Files are not accepted");
      entries.push([key, value]);
    }
    return Object.fromEntries(entries);
  }
  return request.json();
}
