import assert from "node:assert/strict";
import { resolveCname, resolveTxt } from "node:dns/promises";
import { pathToFileURL } from "node:url";

const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const selectorPattern = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/u;

function mailboxDomain(value) {
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return undefined;
  const match = /(?:^|<)[^<>\s@]+@([^<>\s]+)>?$/u.exec(value.trim());
  return match?.[1]?.toLowerCase();
}

function tags(record) {
  return new Map(
    record
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return separator === -1
          ? [item.toLowerCase(), ""]
          : [
              item.slice(0, separator).trim().toLowerCase(),
              item.slice(separator + 1).trim(),
            ];
      }),
  );
}

export function validateEmailDomainEvidence(evidence) {
  assert.equal(typeof evidence, "object");
  assert.ok(evidence);
  const { from, domain, dkimSelector } = evidence.sender ?? {};
  assert.equal(typeof from, "string", "Sender mailbox is required");
  assert.equal(typeof domain, "string", "Sending domain is required");
  assert.equal(typeof dkimSelector, "string", "DKIM selector is required");
  const normalizedDomain = domain.toLowerCase();
  assert.match(normalizedDomain, domainPattern, "Sending domain is invalid");
  assert.match(dkimSelector, selectorPattern, "DKIM selector is invalid");
  assert.equal(
    mailboxDomain(from),
    normalizedDomain,
    "EMAIL_FROM must align exactly with the authenticated sending domain",
  );

  const spf = evidence.dns?.spf ?? [];
  const dkim = evidence.dns?.dkim ?? [];
  const dmarc = evidence.dns?.dmarc ?? [];
  assert.equal(
    spf.filter((record) => /^v=spf1\b/iu.test(record)).length,
    1,
    "Exactly one SPF policy is required",
  );
  const spfPolicy = spf.find((record) => /^v=spf1\b/iu.test(record));
  assert.match(spfPolicy, /\s-all\s*$/iu, "SPF must end in a hard fail (-all)");

  assert.equal(dkim.length, 1, "Exactly one resolved DKIM policy is required");
  const dkimTags = tags(dkim[0]);
  assert.equal(
    dkimTags.get("v")?.toUpperCase(),
    "DKIM1",
    "DKIM v=DKIM1 is required",
  );
  assert.ok(
    ["rsa", "ed25519"].includes((dkimTags.get("k") ?? "rsa").toLowerCase()),
    "DKIM key algorithm must be RSA or Ed25519",
  );
  assert.ok(
    (dkimTags.get("p") ?? "").replace(/\s/gu, "").length >= 32,
    "DKIM public key is missing or implausibly short",
  );

  assert.equal(dmarc.length, 1, "Exactly one DMARC policy is required");
  const dmarcTags = tags(dmarc[0]);
  assert.equal(
    dmarcTags.get("v")?.toUpperCase(),
    "DMARC1",
    "DMARC v=DMARC1 is required",
  );
  assert.ok(
    ["quarantine", "reject"].includes((dmarcTags.get("p") ?? "").toLowerCase()),
    "DMARC must enforce quarantine or reject",
  );
  assert.equal(dmarcTags.get("pct") ?? "100", "100", "DMARC pct must be 100");
  assert.equal(
    (dmarcTags.get("adkim") ?? "r").toLowerCase(),
    "s",
    "DMARC DKIM alignment must be strict",
  );
  assert.equal(
    (dmarcTags.get("aspf") ?? "r").toLowerCase(),
    "s",
    "DMARC SPF alignment must be strict",
  );
  return {
    domain: normalizedDomain,
    dkimName: `${dkimSelector}._domainkey.${normalizedDomain}`,
    dmarcName: `_dmarc.${normalizedDomain}`,
  };
}

async function txt(name) {
  return (await resolveTxt(name)).map((segments) => segments.join(""));
}

async function dkimTxt(name) {
  try {
    return await txt(name);
  } catch (error) {
    if (error?.code !== "ENODATA" && error?.code !== "ENOTFOUND") throw error;
    const aliases = await resolveCname(name);
    assert.equal(
      aliases.length,
      1,
      "DKIM must resolve through one CNAME target",
    );
    return txt(aliases[0]);
  }
}

export async function inspectEmailDomain({ from, domain, dkimSelector }) {
  const normalizedDomain = domain.toLowerCase();
  const dkimName = `${dkimSelector}._domainkey.${normalizedDomain}`;
  const evidence = {
    sender: { from, domain: normalizedDomain, dkimSelector },
    dns: {
      spf: await txt(normalizedDomain),
      dkim: await dkimTxt(dkimName),
      dmarc: await txt(`_dmarc.${normalizedDomain}`),
    },
  };
  return validateEmailDomainEvidence(evidence);
}

function verifyFixtures() {
  const valid = {
    sender: {
      from: "Project AMANOR <desk@mail.amanor.example>",
      domain: "mail.amanor.example",
      dkimSelector: "amanor-2026",
    },
    dns: {
      spf: ["v=spf1 include:provider.example -all"],
      dkim: ["v=DKIM1; k=rsa; p=abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890"],
      dmarc: ["v=DMARC1; p=reject; pct=100; adkim=s; aspf=s"],
    },
  };
  validateEmailDomainEvidence(valid);
  const dangerous = [
    structuredClone(valid),
    structuredClone(valid),
    structuredClone(valid),
    structuredClone(valid),
    structuredClone(valid),
    structuredClone(valid),
  ];
  dangerous[0].sender.from = "desk@lookalike.example";
  dangerous[1].dns.spf = ["v=spf1 include:provider.example ~all"];
  dangerous[2].dns.spf.push("v=spf1 -all");
  dangerous[3].dns.dkim = ["v=DKIM1; p="];
  dangerous[4].dns.dmarc = ["v=DMARC1; p=none; adkim=s; aspf=s"];
  dangerous[5].dns.dmarc = ["v=DMARC1; p=reject; pct=25; adkim=r; aspf=r"];
  for (const fixture of dangerous)
    assert.throws(() => validateEmailDomainEvidence(fixture));
  process.stdout.write(
    "Email-domain policy validates aligned SPF, DKIM and DMARC; 6 dangerous fixtures rejected.\n",
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--verify-fixtures")) return verifyFixtures();
  const value = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const from = value("--from");
  const domain = value("--domain");
  const dkimSelector = value("--selector");
  if (!from || !domain || !dkimSelector)
    throw new Error(
      "Usage: node scripts/check-email-domain.mjs --from <mailbox> --domain <domain> --selector <selector>",
    );
  const result = await inspectEmailDomain({ from, domain, dkimSelector });
  process.stdout.write(
    `${JSON.stringify({ status: "pass", ...result }, null, 2)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
