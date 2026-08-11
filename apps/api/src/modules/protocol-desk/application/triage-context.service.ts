import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import {
  counterpartySchema,
  deskConfigurationSchema,
} from "../../content/domain/schemas";
import type {
  ContentVersion,
  Publication,
} from "../../content/domain/workflow";
import type { EngagementRequestInput } from "../domain/engagement-request";
import type { TriageContext } from "../domain/triage-engine";
import { AvailabilityService } from "./availability.service";

const defaultEngagementDurationMs = 2 * 60 * 60 * 1_000;

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-GB");
}

function containsGovernedName(text: string, name: string): boolean {
  const escaped = normalized(name).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
    "u",
  ).test(text);
}

function domainVerified(input: EngagementRequestInput): boolean {
  if (!input.organisation.website) return false;
  const emailDomain = input.requester.email.split("@")[1];
  const websiteDomain = new URL(input.organisation.website).hostname.replace(
    /^www\./u,
    "",
  );
  return (
    emailDomain === websiteDomain ||
    Boolean(emailDomain?.endsWith(`.${websiteDomain}`))
  );
}

@Injectable()
export class TriageContextService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly availability: AvailabilityService,
  ) {}

  async forSubmission(
    input: EngagementRequestInput,
    screenedAt = new Date(),
  ): Promise<TriageContext> {
    const endsAt =
      input.engagement.endsAt ??
      new Date(
        input.engagement.startsAt.getTime() + defaultEngagementDurationMs,
      );
    const [counterpartyMatches, clashes, configuration] = await Promise.all([
      this.counterpartyMatches(input),
      this.availability.conflicts({
        startsAt: input.engagement.startsAt,
        endsAt,
      }),
      this.configuration(input.locale),
    ]);
    return {
      screenedAt,
      organisationDomainVerified: domainVerified(input),
      counterpartyMatches,
      hasCalendarClash: clashes.length > 0,
      sensitivityMatches:
        configuration?.sensitivityTerms.filter((term) =>
          containsGovernedName(
            normalized(
              [
                input.ask.proposedTheme,
                input.ask.objective,
                input.organisation.convenors,
              ]
                .filter(Boolean)
                .join(" "),
            ),
            term,
          ),
        ) ?? [],
      approvedThemeTerms: configuration?.approvedThemeTerms ?? [],
      liveAgendaTerms: configuration?.liveAgendaTerms ?? [],
    };
  }

  private async configuration(
    locale: EngagementRequestInput["locale"],
  ): Promise<ReturnType<typeof deskConfigurationSchema.parse> | undefined> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const publication = await this.connection.db
      .collection<Publication>("publications")
      .findOne({
        documentType: "deskConfiguration",
        documentId: "protocol-desk",
        locale,
      });
    if (!publication) return undefined;
    const version = await this.connection.db
      .collection<ContentVersion>("content_versions")
      .findOne({
        documentType: "deskConfiguration",
        documentId: publication.documentId,
        version: publication.version,
        state: "published",
      });
    const parsed = deskConfigurationSchema.safeParse(version?.payload);
    return parsed.success ? parsed.data : undefined;
  }

  private async counterpartyMatches(
    input: EngagementRequestInput,
  ): Promise<readonly string[]> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const publications = await this.connection.db
      .collection<Publication>("publications")
      .find({ documentType: "counterparty", locale: input.locale })
      .toArray();
    if (!publications.length) return [];
    const versions = await this.connection.db
      .collection<ContentVersion>("content_versions")
      .find({
        documentType: "counterparty",
        state: "published",
        $or: publications.map(({ documentId, version }) => ({
          documentId,
          version,
        })),
      })
      .toArray();
    const organisation = normalized(input.organisation.name);
    const convenors = normalized(input.organisation.convenors ?? "");
    const matches = new Set<string>();
    for (const version of versions) {
      const parsed = counterpartySchema.safeParse(version.payload);
      if (!parsed.success || parsed.data.status === "clear") continue;
      const names = [parsed.data.organisationCanonical, ...parsed.data.aliases];
      if (
        names.some(
          (name) =>
            organisation === normalized(name) ||
            containsGovernedName(convenors, name),
        )
      )
        matches.add(parsed.data.organisationCanonical);
    }
    return [...matches].sort((left, right) => left.localeCompare(right));
  }
}
