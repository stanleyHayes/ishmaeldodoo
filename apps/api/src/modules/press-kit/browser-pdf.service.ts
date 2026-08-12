import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

const runFile = promisify(execFile);
const maximumPdfBytes = 20 * 1024 * 1024;
const maximumHtmlBytes = 2 * 1024 * 1024;

export function assertOfflineGeneratedHtml(html: string): void {
  if (
    Buffer.byteLength(html, "utf8") > maximumHtmlBytes ||
    !html.trimStart().toLowerCase().startsWith("<!doctype html>")
  )
    throw new Error("Generated HTML is missing or exceeds the size limit");
  const normalized = html.toLowerCase();
  for (const forbidden of [
    "http:",
    "https:",
    'src="//',
    "src='//",
    'href="//',
    "href='//",
    "file:",
    "javascript:",
  ])
    if (normalized.includes(forbidden))
      throw new Error("Generated HTML may not reference external resources");
}

function executablePath(): string {
  if (process.env.CHROME_EXECUTABLE_PATH)
    return process.env.CHROME_EXECUTABLE_PATH;
  if (process.platform === "darwin")
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "/usr/bin/chromium";
}

@Injectable()
export class BrowserPdfService {
  async render(html: string): Promise<Buffer<ArrayBufferLike>> {
    assertOfflineGeneratedHtml(html);
    const directory = await mkdtemp(path.join(tmpdir(), "amanor-print-"));
    const source = path.join(directory, "document.html");
    const output = path.join(directory, "document.pdf");
    try {
      await writeFile(source, html, { encoding: "utf8", mode: 0o600 });
      const flags = [
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        `--print-to-pdf=${output}`,
        new URL(`file://${source}`).href,
      ];
      if (process.env.CHROME_NO_SANDBOX === "true")
        flags.unshift("--no-sandbox");
      await runFile(executablePath(), flags, {
        timeout: 25_000,
        maxBuffer: 1024 * 1024,
      });
      const pdf = await readFile(output);
      if (
        pdf.byteLength < 100 ||
        pdf.byteLength > maximumPdfBytes ||
        pdf.subarray(0, 5).toString() !== "%PDF-"
      )
        throw new Error("Browser returned an invalid PDF");
      return pdf;
    } catch (error) {
      throw new ServiceUnavailableException(
        "Document generation is unavailable",
        {
          cause: error,
        },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
