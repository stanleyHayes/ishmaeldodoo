"use client";

import type { ContentKind, MediaAssetListQuery } from "@amanor/contracts";
import { GovernedMediaPicker } from "../media/governed-media-picker";
import { AdminEmptyState } from "../ui/admin-state";

type Option = Readonly<{ value: string; label: string }>;
type Field = Readonly<{
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "datetime"
    | "boolean"
    | "select"
    | "multiSelect"
    | "strings"
    | "mediaAsset"
    | "mediaAssets"
    | "numbers"
    | "localized"
    | "localizedList"
    | "object"
    | "objectList";
  options?: readonly Option[];
  fields?: readonly Field[];
  defaultValue?: unknown;
  optional?: boolean;
  mediaFolder?: MediaAssetListQuery["folder"];
  mediaResourceType?: MediaAssetListQuery["resourceType"];
  maximum?: number;
}>;

const option = (...values: readonly string[]): readonly Option[] =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
const localized = (key: string, label: string): Field => ({
  key,
  label,
  type: "localized",
});

const schemas: Record<Exclude<ContentKind, "page">, readonly Field[]> = {
  identity: [
    {
      key: "singletonKey",
      label: "Registry key",
      type: "text",
      defaultValue: "canonical",
    },
    { key: "legalName", label: "Legal name", type: "text" },
    { key: "honorific", label: "Honorific", type: "text" },
    { key: "displayName", label: "Display name", type: "text" },
    { key: "givenName", label: "Given name", type: "text", optional: true },
    {
      key: "additionalName",
      label: "Additional name",
      type: "text",
      optional: true,
    },
    { key: "familyName", label: "Family name", type: "text", optional: true },
    { key: "shortName", label: "Short name", type: "text" },
    { key: "familiarName", label: "Familiar name", type: "text" },
    localized("pronunciationGuide", "Pronunciation guide"),
    {
      key: "pronunciationAudio",
      label: "Pronunciation audio",
      type: "mediaAsset",
      mediaResourceType: "video",
      optional: true,
    },
    localized("nationality", "Nationality"),
    { key: "languages", label: "Languages", type: "strings" },
    localized("location", "Location"),
    {
      key: "titleHistory",
      label: "Title history",
      type: "objectList",
      fields: [
        localized("title", "Title"),
        localized("longFormTitle", "Long-form title"),
        localized("organisation", "Organisation"),
        { key: "from", label: "From", type: "date" },
        { key: "to", label: "To", type: "date", defaultValue: null },
        { key: "sourceRef", label: "Source reference", type: "text" },
      ],
    },
    localized("bio40", "40-word biography"),
    {
      key: "bio40SourceRefs",
      label: "40-word biography sources",
      type: "strings",
    },
    localized("bio120", "120-word biography"),
    {
      key: "bio120SourceRefs",
      label: "120-word biography sources",
      type: "strings",
    },
    localized("bio300", "300-word biography"),
    {
      key: "bio300SourceRefs",
      label: "300-word biography sources",
      type: "strings",
    },
    {
      key: "portraits",
      label: "Approved profile portraits",
      type: "mediaAssets",
      mediaFolder: "portraits",
      mediaResourceType: "image",
      maximum: 3,
    },
    {
      key: "sameAs",
      label: "Verified identity URLs",
      type: "strings",
      optional: true,
    },
    {
      key: "alumniOf",
      label: "Alumni institutions",
      type: "strings",
      optional: true,
    },
    {
      key: "knowsAbout",
      label: "Areas of expertise",
      type: "strings",
      optional: true,
    },
    {
      ...localized("disambiguation", "Not-to-be-confused-with note"),
      optional: true,
    },
  ],
  atlasNode: [
    { key: "slug", label: "Slug", type: "text" },
    localized("label", "Map label"),
    localized("institution", "Institution"),
    localized("role", "Role"),
    { key: "country", label: "Country", type: "text" },
    { key: "city", label: "City", type: "text", optional: true },
    {
      key: "coordinates",
      label: "Longitude, latitude",
      type: "numbers",
      optional: true,
    },
    { key: "region", label: "Region fallback", type: "text", optional: true },
    { key: "startDate", label: "Start date", type: "date" },
    { key: "endDate", label: "End date", type: "date" },
    { key: "era", label: "Era", type: "text" },
    { key: "themes", label: "Theme IDs", type: "strings" },
    {
      key: "portfolioValue",
      label: "Portfolio value",
      type: "number",
      optional: true,
    },
    { key: "currency", label: "Currency code", type: "text", optional: true },
    { key: "valueYear", label: "Value year", type: "number", optional: true },
    {
      key: "valueType",
      label: "Value type",
      type: "select",
      options: option("managed", "raised", "designed"),
      optional: true,
    },
    { key: "outcomes", label: "Outcomes", type: "localizedList" },
    {
      key: "image",
      label: "Atlas image",
      type: "mediaAsset",
      mediaFolder: "atlas",
      mediaResourceType: "image",
      optional: true,
    },
    { key: "sourceRefs", label: "Source references", type: "strings" },
    {
      key: "relatedArchive",
      label: "Related Archive item slugs",
      type: "strings",
      optional: true,
    },
    {
      key: "homepageProof",
      label: "Homepage proof point",
      type: "object",
      optional: true,
      fields: [
        { key: "order", label: "Order (1-9)", type: "number" },
        localized("label", "Proof label"),
        {
          key: "emphasisFor",
          label: "Emphasise for audiences",
          type: "multiSelect",
          options: option(
            "government",
            "investor",
            "media",
            "youth",
            "philanthropy",
          ),
        },
      ],
    },
    {
      key: "homepageAct",
      label: "Homepage act card",
      type: "object",
      optional: true,
      fields: [
        {
          key: "act",
          label: "Act",
          type: "select",
          options: option("forest", "system", "bridge", "architecture"),
        },
        localized("label", "Act label"),
        localized("dateRange", "Date range"),
        localized("place", "Place"),
        localized("figure", "Figure"),
        localized("sentence", "Summary sentence"),
      ],
    },
  ],
  speakingTheme: [
    { key: "slug", label: "Slug", type: "text" },
    localized("title", "Title"),
    localized("summary", "60-word abstract"),
    {
      key: "audiences",
      label: "Suited audiences",
      type: "localizedList",
    },
    {
      key: "formats",
      label: "Formats",
      type: "strings",
    },
    { key: "sourceRefs", label: "Source references", type: "strings" },
    {
      key: "relatedNodes",
      label: "Related Atlas node slugs",
      type: "strings",
    },
    {
      key: "featured",
      label: "Featured",
      type: "boolean",
      defaultValue: false,
    },
    {
      key: "history",
      label: "Speaking history",
      type: "objectList",
      optional: true,
      fields: [
        { key: "slug", label: "Anchor slug", type: "text" },
        localized("title", "Engagement title"),
        localized("host", "Host organisation"),
        { key: "date", label: "Date", type: "date" },
        { key: "city", label: "City", type: "text", optional: true },
        { key: "country", label: "Country", type: "text" },
        {
          key: "format",
          label: "Format",
          type: "select",
          options: option(
            "keynote",
            "plenary_panel",
            "fireside",
            "institutional_briefing",
            "media_interview",
            "academic_lecture",
            "youth_address",
            "workshop",
          ),
        },
        { key: "sourceRefs", label: "Source references", type: "strings" },
      ],
    },
    {
      key: "media",
      label: "Speaking media",
      type: "objectList",
      optional: true,
      fields: [
        {
          key: "assetId",
          label: "Governed media",
          type: "mediaAsset",
          mediaFolder: "speaking",
        },
        {
          key: "kind",
          label: "Media kind",
          type: "select",
          options: option("image", "video"),
        },
        localized("caption", "Caption"),
        {
          key: "relatedArchive",
          label: "Related Archive transcript slug",
          type: "text",
          optional: true,
        },
        { key: "sourceRef", label: "Source reference", type: "text" },
      ],
    },
  ],
  signal: [
    { key: "slug", label: "Slug", type: "text" },
    localized("body", "Signal"),
    {
      key: "publishedAt",
      label: "Published at",
      type: "datetime",
      optional: true,
    },
    { key: "tags", label: "Tags", type: "strings" },
    {
      key: "confidence",
      label: "Confidence",
      type: "select",
      options: option("watching", "expecting", "callingIt"),
    },
    localized("changeMyMind", "What would change my mind"),
    { key: "sourceRefs", label: "Source references", type: "strings" },
    { key: "reviewDue", label: "Review due", type: "date", optional: true },
    {
      key: "resolution",
      label: "Resolution",
      type: "select",
      options: option("heldUp", "partly", "didNot", "tooEarly"),
      optional: true,
    },
    { ...localized("resolutionNote", "Resolution note"), optional: true },
    {
      key: "resolvedAt",
      label: "Resolved at",
      type: "datetime",
      optional: true,
    },
  ],
  archiveItem: [
    { key: "slug", label: "Slug", type: "text" },
    localized("title", "Title"),
    {
      key: "type",
      label: "Archive type",
      type: "select",
      options: option("speech", "interview", "panel", "article", "broadcast"),
    },
    { key: "venue", label: "Venue", type: "text", optional: true },
    { key: "city", label: "City", type: "text", optional: true },
    { key: "country", label: "Country", type: "text", optional: true },
    { key: "date", label: "Date", type: "date" },
    {
      key: "language",
      label: "Primary language",
      type: "select",
      options: option("en", "fr"),
    },
    { key: "mediaUrl", label: "Media URL", type: "text", optional: true },
    { ...localized("transcript", "Transcript"), optional: true },
    {
      key: "transcriptStatus",
      label: "Transcript status",
      type: "select",
      options: option("machine", "corrected"),
    },
    {
      key: "chapters",
      label: "Chapters",
      type: "objectList",
      optional: true,
      fields: [
        { key: "slug", label: "Anchor slug", type: "text" },
        localized("label", "Chapter label"),
        { key: "startSeconds", label: "Start (seconds)", type: "number" },
        {
          key: "endSeconds",
          label: "End (seconds)",
          type: "number",
          optional: true,
        },
      ],
    },
    {
      key: "transcriptSegments",
      label: "Timestamped transcript segments",
      type: "objectList",
      optional: true,
      fields: [
        { key: "startSeconds", label: "Start (seconds)", type: "number" },
        localized("text", "Transcript segment"),
      ],
    },
    { key: "sourceRefs", label: "Source references", type: "strings" },
    {
      key: "corrections",
      label: "Public correction log",
      type: "objectList",
      optional: true,
      fields: [
        localized("incorrectQuote", "Incorrect public quotation"),
        localized("correction", "Issued correction"),
        { key: "issuedAt", label: "Issued date", type: "date" },
        { key: "sourceRef", label: "Source reference", type: "text" },
      ],
    },
    {
      key: "approvedForDoctrine",
      label: "Approved for Doctrine",
      type: "boolean",
      defaultValue: false,
    },
  ],
  source: [
    { key: "ref", label: "Reference ID", type: "text" },
    { key: "title", label: "Title", type: "text" },
    { key: "publisher", label: "Publisher", type: "text" },
    { key: "url", label: "URL", type: "text", optional: true },
    { key: "accessedAt", label: "Accessed date", type: "date" },
    {
      key: "type",
      label: "Source type",
      type: "select",
      options: option("cv", "press", "official", "firstParty"),
    },
    { key: "notes", label: "Internal notes", type: "textarea", optional: true },
  ],
  scholar: [
    { key: "name", label: "Name", type: "text" },
    { key: "country", label: "Country", type: "text" },
    { key: "institution", label: "Institution", type: "text" },
    localized("field", "Field"),
    { key: "cohortYear", label: "Cohort year", type: "number" },
    { key: "status", label: "Programme status", type: "text" },
    {
      key: "photo",
      label: "Scholar photo",
      type: "mediaAsset",
      mediaFolder: "scholars",
      mediaResourceType: "image",
      optional: true,
    },
    localized("story", "Story"),
    {
      key: "consentStatus",
      label: "Consent status",
      type: "select",
      options: option("pending", "granted", "withdrawn"),
    },
    { key: "consentDate", label: "Consent date", type: "date", optional: true },
    {
      key: "consentVersion",
      label: "Consent notice version",
      type: "text",
      optional: true,
    },
  ],
  officeHoursCycle: [
    { key: "slug", label: "Slug", type: "text" },
    localized("title", "Title"),
    localized("prompt", "Prompt"),
    { key: "opensAt", label: "Opens at", type: "datetime" },
    { key: "closesAt", label: "Closes at", type: "datetime" },
    { key: "drawAt", label: "Draw at", type: "datetime" },
    { key: "answerTargetAt", label: "Answer target", type: "datetime" },
    { key: "slotCount", label: "Available slots", type: "number" },
    { key: "entries", label: "Entry IDs", type: "strings" },
    { key: "drawn", label: "Drawn entry IDs", type: "strings" },
    {
      key: "weightingRules",
      label: "Published weighting rules",
      type: "localizedList",
    },
    {
      key: "status",
      label: "Cycle status",
      type: "select",
      options: option("draft", "open", "closed", "answering", "complete"),
    },
    localized("fairnessNotice", "Fairness notice"),
    {
      key: "privacyNoticeVersion",
      label: "Privacy notice version",
      type: "text",
    },
  ],
  officeHoursAnswer: [
    { key: "cycleId", label: "Cycle ID", type: "text" },
    { key: "questionId", label: "Question ID", type: "text" },
    localized("question", "Question"),
    { key: "entrantName", label: "Entrant name", type: "text" },
    { key: "entrantCountry", label: "Entrant country", type: "text" },
    localized("answer", "Answer"),
    { key: "publishedAt", label: "Published at", type: "datetime" },
    {
      key: "entrantConsent",
      label: "Entrant consent confirmed",
      type: "boolean",
      defaultValue: true,
    },
    {
      key: "redacted",
      label: "Personal data redacted",
      type: "boolean",
      defaultValue: true,
    },
    { key: "sourceRefs", label: "Source references", type: "strings" },
  ],
  selahEntry: [
    localized("body", "Reflection"),
    { key: "publishedAt", label: "Published at", type: "datetime" },
  ],
  riderTemplate: [
    { key: "key", label: "Template key", type: "text" },
    localized("name", "Name"),
    {
      key: "engagementType",
      label: "Engagement type",
      type: "select",
      options: option("keynote", "fireside", "panel", "workshop", "briefing"),
    },
    { key: "logistics", label: "Logistics", type: "localizedList" },
    {
      key: "technicalRequirements",
      label: "Technical requirements",
      type: "localizedList",
    },
    { key: "timing", label: "Timing", type: "localizedList" },
    {
      key: "travelAndAccommodation",
      label: "Travel and accommodation",
      type: "localizedList",
    },
    {
      key: "recordingAndRepublication",
      label: "Recording and republication",
      type: "localizedList",
    },
    {
      key: "honorariumTerms",
      label: "Honorarium terms",
      type: "localizedList",
    },
    {
      key: "protocolRequirements",
      label: "Protocol requirements",
      type: "localizedList",
    },
    {
      key: "contactRequirements",
      label: "Contact requirements",
      type: "localizedList",
    },
    {
      key: "accessibilityRequirements",
      label: "Accessibility requirements",
      type: "localizedList",
    },
    { key: "versionLabel", label: "Version label", type: "text" },
  ],
  emailTemplate: [
    {
      key: "key",
      label: "Template key",
      type: "select",
      options: option(
        "acknowledgement",
        "status-update",
        "information-request",
        "hold-placed",
        "acceptance",
        "decline-capacity",
        "decline-fit",
        "decline-conflict",
        "follow-up",
      ),
    },
    localized("subject", "Subject"),
    localized("bodyText", "Plain-text body"),
    localized("bodyHtml", "HTML body"),
    { key: "allowedVariables", label: "Allowed variables", type: "strings" },
    {
      key: "transactional",
      label: "Transactional email",
      type: "boolean",
      defaultValue: true,
    },
  ],
  blackout: [
    { key: "startsAt", label: "Starts at", type: "datetime" },
    { key: "endsAt", label: "Ends at", type: "datetime" },
    {
      key: "reason",
      label: "Reason",
      type: "select",
      options: option(
        "travel",
        "public_duty",
        "personal",
        "preparation",
        "other",
      ),
    },
    {
      key: "visibility",
      label: "Visibility",
      type: "select",
      options: option("busy", "unavailable"),
    },
    { key: "notes", label: "Internal notes", type: "textarea", optional: true },
  ],
  counterparty: [
    {
      key: "organisationCanonical",
      label: "Canonical organisation",
      type: "text",
    },
    { key: "aliases", label: "Aliases", type: "strings" },
    { key: "country", label: "Country code", type: "text" },
    {
      key: "status",
      label: "Risk status",
      type: "select",
      options: option("clear", "watch", "restricted"),
    },
    { key: "rationale", label: "Rationale", type: "textarea" },
    { key: "reviewedAt", label: "Reviewed at", type: "date" },
    { key: "reviewDueAt", label: "Review due", type: "date" },
    { key: "sourceRefs", label: "Source references", type: "strings" },
  ],
  deskConfiguration: [
    {
      key: "singletonKey",
      label: "Registry key",
      type: "text",
      defaultValue: "protocol-desk",
    },
    {
      key: "sensitivityTerms",
      label: "Sensitivity terms",
      type: "strings",
    },
    {
      key: "approvedThemeTerms",
      label: "Approved theme terms",
      type: "strings",
    },
    {
      key: "liveAgendaTerms",
      label: "Live agenda terms",
      type: "strings",
    },
  ],
};

type Payload = Record<string, unknown>;
type LocalizedValue = {
  "en-GB": string;
  "fr-FR": string;
  status: { "en-GB": "current"; "fr-FR": "current" | "stale" | "missing" };
  sourceUpdatedAt: string;
};

function newLocalized(): LocalizedValue {
  return {
    "en-GB": "",
    "fr-FR": "",
    status: { "en-GB": "current", "fr-FR": "missing" },
    sourceUpdatedAt: new Date().toISOString(),
  };
}
function isPayload(value: unknown): value is Payload {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function asLocalized(value: unknown): LocalizedValue {
  return isPayload(value) && typeof value["en-GB"] === "string"
    ? (value as LocalizedValue)
    : newLocalized();
}
function initialValue(field: Field): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "localized") return newLocalized();
  if (
    [
      "strings",
      "mediaAssets",
      "numbers",
      "multiSelect",
      "localizedList",
      "objectList",
    ].includes(field.type)
  )
    return [];
  if (field.type === "boolean") return false;
  return "";
}
function initialise(fields: readonly Field[]): Payload {
  return Object.fromEntries(
    fields
      .filter((field) => !field.optional)
      .map((field) => [field.key, initialValue(field)]),
  );
}
function inputDate(value: unknown, datetime: boolean): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, datetime ? 16 : 10);
}
function outputDate(value: string, datetime: boolean): string {
  return value
    ? new Date(`${value}${datetime ? ":00Z" : "T00:00:00Z"}`).toISOString()
    : "";
}

function LocalizedControl({
  id,
  label,
  value,
  readOnly,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: unknown;
  readOnly: boolean;
  onChange: (value: LocalizedValue) => void;
}>) {
  const field = asLocalized(value);
  const english = (next: string) =>
    onChange({
      ...field,
      "en-GB": next,
      status: {
        ...field.status,
        "fr-FR": next !== field["en-GB"] ? "stale" : field.status["fr-FR"],
      },
      sourceUpdatedAt:
        next !== field["en-GB"]
          ? new Date().toISOString()
          : field.sourceUpdatedAt,
    });
  const french = (next: string) =>
    onChange({
      ...field,
      "fr-FR": next,
      status: { ...field.status, "fr-FR": next.trim() ? "current" : "missing" },
    });
  return (
    <fieldset className="localized-editor">
      <legend>{label}</legend>
      <div className="locale-field">
        <label htmlFor={`${id}-en`}>{label}, English</label>
        <textarea
          id={`${id}-en`}
          value={field["en-GB"]}
          onChange={(event) => english(event.target.value)}
          readOnly={readOnly}
        />
      </div>
      <div className="locale-field">
        <label htmlFor={`${id}-fr`}>{label}, French</label>
        <textarea
          id={`${id}-fr`}
          value={field["fr-FR"]}
          onChange={(event) => french(event.target.value)}
          readOnly={readOnly}
        />
        <label className="status-label" htmlFor={`${id}-status`}>
          {label} translation status
        </label>
        <select
          id={`${id}-status`}
          value={field.status["fr-FR"]}
          onChange={(event) =>
            onChange({
              ...field,
              status: {
                ...field.status,
                "fr-FR": event.target
                  .value as LocalizedValue["status"]["fr-FR"],
              },
            })
          }
          disabled={readOnly}
        >
          <option value="current">Current</option>
          <option value="stale">Stale</option>
          <option value="missing">Missing</option>
        </select>
      </div>
    </fieldset>
  );
}

function FieldControl({
  field,
  value,
  id,
  readOnly,
  parentItem,
  onChange,
}: Readonly<{
  field: Field;
  value: unknown;
  id: string;
  readOnly: boolean;
  parentItem?: Payload;
  onChange: (value: unknown) => void;
}>) {
  if (field.type === "localized")
    return (
      <LocalizedControl
        id={id}
        label={field.label}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  if (field.type === "localizedList") {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset className="repeatable-field">
        <legend>{field.label}</legend>
        {items.map((item, index) => (
          <div className="repeatable-item" key={`${id}-${index}`}>
            <LocalizedControl
              id={`${id}-${index}`}
              label={`${field.label} ${index + 1}`}
              value={item}
              readOnly={readOnly}
              onChange={(next) =>
                onChange(
                  items.map((current, currentIndex) =>
                    currentIndex === index ? next : current,
                  ),
                )
              }
            />
            {!readOnly ? (
              <button
                className="danger-button"
                type="button"
                onClick={() =>
                  onChange(
                    items.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {!readOnly ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => onChange([...items, newLocalized()])}
          >
            Add {field.label.toLowerCase()}
          </button>
        ) : null}
      </fieldset>
    );
  }
  if (field.type === "object") {
    const item = isPayload(value) ? value : initialise(field.fields ?? []);
    return (
      <fieldset className="repeatable-field">
        <legend>{field.label}</legend>
        {field.fields?.map((child) => (
          <FieldControl
            key={child.key}
            field={child}
            id={`${id}-${child.key}`}
            value={item[child.key]}
            readOnly={readOnly}
            onChange={(next) => onChange({ ...item, [child.key]: next })}
          />
        ))}
        {field.optional && !readOnly ? (
          <button
            className="danger-button"
            type="button"
            onClick={() => onChange(undefined)}
          >
            Clear {field.label.toLowerCase()}
          </button>
        ) : null}
      </fieldset>
    );
  }
  if (field.type === "objectList") {
    const items = Array.isArray(value) ? value.filter(isPayload) : [];
    return (
      <fieldset className="repeatable-field">
        <legend>{field.label}</legend>
        {items.map((item, index) => (
          <div className="repeatable-item" key={`${id}-${index}`}>
            {field.fields?.map((child) => (
              <FieldControl
                key={child.key}
                field={child}
                id={`${id}-${index}-${child.key}`}
                value={item[child.key]}
                readOnly={readOnly}
                parentItem={item}
                onChange={(next) =>
                  onChange(
                    items.map((current, currentIndex) =>
                      currentIndex === index
                        ? (() => {
                            const updated = {
                              ...current,
                              [child.key]: next,
                            };
                            if (child.key === "kind" && "assetId" in updated)
                              delete updated.assetId;
                            return updated;
                          })()
                        : current,
                    ),
                  )
                }
              />
            ))}
            {!readOnly ? (
              <button
                className="danger-button"
                type="button"
                onClick={() =>
                  onChange(
                    items.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {!readOnly ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => onChange([...items, initialise(field.fields ?? [])])}
          >
            Add {field.label.toLowerCase()}
          </button>
        ) : null}
      </fieldset>
    );
  }
  if (field.type === "boolean")
    return (
      <label className="check-field">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          disabled={readOnly}
        />
        {field.label}
      </label>
    );
  if (field.type === "select")
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={readOnly}
        >
          <option value="">Select</option>
          {field.options?.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    );
  if (field.type === "multiSelect") {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
    return (
      <fieldset className="field">
        <legend>{field.label}</legend>
        {field.options?.map((item) => (
          <label className="check-field" key={item.value}>
            <input
              type="checkbox"
              checked={selected.includes(item.value)}
              disabled={readOnly}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, item.value]
                    : selected.filter((value) => value !== item.value),
                )
              }
            />
            {item.label}
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.type === "mediaAsset" || field.type === "mediaAssets")
    return (
      <GovernedMediaPicker
        id={id}
        label={field.label}
        value={
          field.type === "mediaAssets"
            ? Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string")
              : []
            : typeof value === "string"
              ? value
              : ""
        }
        readOnly={readOnly}
        multiple={field.type === "mediaAssets"}
        {...(field.maximum === undefined ? {} : { maximum: field.maximum })}
        {...(field.mediaFolder === undefined
          ? {}
          : { folder: field.mediaFolder })}
        {...(field.mediaResourceType === undefined
          ? field.key === "assetId" &&
            (parentItem?.kind === "image" || parentItem?.kind === "video")
            ? { resourceType: parentItem.kind }
            : {}
          : { resourceType: field.mediaResourceType })}
        onChange={onChange}
      />
    );
  if (field.type === "strings" || field.type === "numbers")
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          value={Array.isArray(value) ? value.join(", ") : ""}
          onChange={(event) =>
            onChange(
              event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) =>
                  field.type === "numbers" ? Number(item) : item,
                ),
            )
          }
          readOnly={readOnly}
        />
        <p className="field-help">Comma-separated values.</p>
      </div>
    );
  if (field.type === "textarea")
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
        />
      </div>
    );
  if (field.type === "date" || field.type === "datetime")
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          type={field.type === "date" ? "date" : "datetime-local"}
          value={inputDate(value, field.type === "datetime")}
          onChange={(event) =>
            onChange(outputDate(event.target.value, field.type === "datetime"))
          }
          readOnly={readOnly}
        />
      </div>
    );
  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      <input
        id={id}
        type={field.type === "number" ? "number" : "text"}
        value={
          typeof value === "number" || typeof value === "string" ? value : ""
        }
        onChange={(event) =>
          onChange(
            field.type === "number"
              ? event.target.value
                ? Number(event.target.value)
                : ""
              : event.target.value,
          )
        }
        readOnly={readOnly}
      />
    </div>
  );
}

export function SchemaPayloadEditor({
  kind,
  rawValue,
  readOnly,
  onChange,
}: Readonly<{
  kind: Exclude<ContentKind, "page">;
  rawValue: string;
  readOnly: boolean;
  onChange: (raw: string) => void;
}>) {
  let payload: Payload | null = null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    payload = isPayload(parsed) ? parsed : null;
  } catch {
    payload = null;
  }
  const fields = schemas[kind];
  if (!payload || Object.keys(payload).length === 0)
    return (
      <AdminEmptyState
        kind="content"
        title={`${kind} fields are not initialised`}
        description="Create the validated field structure to begin. No version is saved until you select Create draft."
        action={
          !readOnly ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                onChange(`${JSON.stringify(initialise(fields), null, 2)}\n`)
              }
            >
              Initialise {kind} fields
            </button>
          ) : undefined
        }
      />
    );
  const commit = (next: Payload) =>
    onChange(`${JSON.stringify(next, null, 2)}\n`);
  return (
    <div className="schema-form">
      {fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          id={`${kind}-${field.key}`}
          value={payload?.[field.key]}
          readOnly={readOnly}
          onChange={(value) => commit({ ...payload!, [field.key]: value })}
        />
      ))}
    </div>
  );
}
