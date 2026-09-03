"use client";

import { GovernedMediaPicker } from "../media/governed-media-picker";
import { AdminEmptyState } from "../ui/admin-state";
import { AdminSelect } from "../ui/admin-select";

type TranslationStatus = "current" | "stale" | "missing";

type LocalizedField = {
  "en-GB": string;
  "fr-FR": string;
  status: { "en-GB": TranslationStatus; "fr-FR": TranslationStatus };
  sourceUpdatedAt: string;
};

type PageSection = {
  key: string;
  heading?: LocalizedField;
  body: LocalizedField;
  sourceRefs: string[];
  recordAct?: "forest" | "system" | "lite" | "return";
  dateline?: LocalizedField;
  fieldImage?: string;
  imageCaption?: LocalizedField;
  claims?: { body: LocalizedField; sourceRefs: string[] }[];
  marginalia?: {
    label: LocalizedField;
    value: LocalizedField;
    sourceRefs: string[];
    image?: string;
  }[];
  pullQuote?: {
    quote: LocalizedField;
    venue: LocalizedField;
    date: string;
    sourceRef: string;
  };
};

type PageDraft = {
  slug: string;
  title: LocalizedField;
  summary: LocalizedField;
  sections: PageSection[];
  seoTitle: LocalizedField;
  seoDescription: LocalizedField;
  ogImage: string;
  noIndex: boolean;
  faqs: {
    question: LocalizedField;
    answer: LocalizedField;
    sourceRefs: string[];
  }[];
};

function localizedField(value = ""): LocalizedField {
  return {
    "en-GB": value,
    "fr-FR": "",
    status: { "en-GB": "current", "fr-FR": "missing" },
    sourceUpdatedAt: new Date().toISOString(),
  };
}

function initialPage(): PageDraft {
  return {
    slug: "/",
    title: localizedField(),
    summary: localizedField(),
    sections: [
      {
        key: "declaration",
        heading: localizedField(),
        body: localizedField(),
        sourceRefs: [],
      },
    ],
    seoTitle: localizedField(),
    seoDescription: localizedField(),
    ogImage: "",
    noIndex: true,
    faqs: [],
  };
}

function isLocalizedField(value: unknown): value is LocalizedField {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<LocalizedField>;
  return (
    typeof candidate["en-GB"] === "string" &&
    typeof candidate["fr-FR"] === "string" &&
    Boolean(candidate.status) &&
    typeof candidate.sourceUpdatedAt !== "undefined"
  );
}

function parsePage(raw: string): PageDraft | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const candidate = value as Partial<PageDraft>;
    if (
      typeof candidate.slug !== "string" ||
      typeof candidate.noIndex !== "boolean" ||
      !isLocalizedField(candidate.title) ||
      !isLocalizedField(candidate.summary) ||
      !isLocalizedField(candidate.seoTitle) ||
      !isLocalizedField(candidate.seoDescription) ||
      (candidate.ogImage !== undefined &&
        typeof candidate.ogImage !== "string") ||
      !Array.isArray(candidate.sections) ||
      !candidate.sections.every(
        (section) =>
          section &&
          typeof section.key === "string" &&
          isLocalizedField(section.body) &&
          (!section.heading || isLocalizedField(section.heading)) &&
          (!section.dateline || isLocalizedField(section.dateline)) &&
          (!section.imageCaption || isLocalizedField(section.imageCaption)) &&
          (!section.claims ||
            (Array.isArray(section.claims) &&
              section.claims.every(
                (claim) =>
                  isLocalizedField(claim.body) &&
                  Array.isArray(claim.sourceRefs),
              ))) &&
          (!section.marginalia ||
            (Array.isArray(section.marginalia) &&
              section.marginalia.every(
                (item) =>
                  isLocalizedField(item.label) &&
                  isLocalizedField(item.value) &&
                  Array.isArray(item.sourceRefs),
              ))) &&
          (!section.pullQuote ||
            (isLocalizedField(section.pullQuote.quote) &&
              isLocalizedField(section.pullQuote.venue) &&
              typeof section.pullQuote.date === "string" &&
              typeof section.pullQuote.sourceRef === "string")) &&
          Array.isArray(section.sourceRefs),
      ) ||
      (candidate.faqs !== undefined &&
        (!Array.isArray(candidate.faqs) ||
          !candidate.faqs.every(
            (faq) =>
              isLocalizedField(faq.question) &&
              isLocalizedField(faq.answer) &&
              Array.isArray(faq.sourceRefs),
          )))
    ) {
      return null;
    }
    return {
      ...(candidate as PageDraft),
      ogImage: candidate.ogImage ?? "",
      faqs: candidate.faqs ?? [],
    };
  } catch {
    return null;
  }
}

function serialized(page: PageDraft) {
  const payload = page.ogImage
    ? page
    : Object.fromEntries(
        Object.entries(page).filter(([key]) => key !== "ogImage"),
      );
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function updateEnglish(field: LocalizedField, value: string): LocalizedField {
  const changed = field["en-GB"] !== value;
  return {
    ...field,
    "en-GB": value,
    status: {
      "en-GB": "current",
      "fr-FR": changed ? "stale" : field.status["fr-FR"],
    },
    sourceUpdatedAt: changed ? new Date().toISOString() : field.sourceUpdatedAt,
  };
}

function updateFrench(field: LocalizedField, value: string): LocalizedField {
  return {
    ...field,
    "fr-FR": value,
    status: {
      ...field.status,
      "fr-FR": value.trim() ? "current" : "missing",
    },
  };
}

function LocalizedEditor({
  id,
  label,
  field,
  multiline = false,
  readOnly,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  field: LocalizedField;
  multiline?: boolean;
  readOnly: boolean;
  onChange: (field: LocalizedField) => void;
}>) {
  return (
    <fieldset className="localized-editor">
      <legend>{label}</legend>
      <div className="locale-field">
        <label htmlFor={`${id}-en`}>{label}, English</label>
        {multiline ? (
          <textarea
            id={`${id}-en`}
            value={field["en-GB"]}
            onChange={(event) =>
              onChange(updateEnglish(field, event.target.value))
            }
            readOnly={readOnly}
          />
        ) : (
          <input
            id={`${id}-en`}
            value={field["en-GB"]}
            onChange={(event) =>
              onChange(updateEnglish(field, event.target.value))
            }
            readOnly={readOnly}
          />
        )}
        <span className="translation-state translation-state--current">
          Current
        </span>
      </div>
      <div className="locale-field">
        <label htmlFor={`${id}-fr`}>{label}, French</label>
        {multiline ? (
          <textarea
            id={`${id}-fr`}
            value={field["fr-FR"]}
            onChange={(event) =>
              onChange(updateFrench(field, event.target.value))
            }
            readOnly={readOnly}
          />
        ) : (
          <input
            id={`${id}-fr`}
            value={field["fr-FR"]}
            onChange={(event) =>
              onChange(updateFrench(field, event.target.value))
            }
            readOnly={readOnly}
          />
        )}
        <AdminSelect
          label={`${label} translation status`}
          value={field.status["fr-FR"]}
          onChange={(event) =>
            onChange({
              ...field,
              status: {
                ...field.status,
                "fr-FR": event.target.value as TranslationStatus,
              },
            })
          }
          disabled={readOnly}
        >
          <option value="current">Current</option>
          <option value="stale">Stale</option>
          <option value="missing">Missing</option>
        </AdminSelect>
      </div>
    </fieldset>
  );
}

function parity(page: PageDraft) {
  const fields = [
    page.title,
    page.summary,
    page.seoTitle,
    page.seoDescription,
    ...page.sections.flatMap((section) => [
      ...(section.heading ? [section.heading] : []),
      section.body,
      ...(section.dateline ? [section.dateline] : []),
      ...(section.imageCaption ? [section.imageCaption] : []),
      ...(section.claims?.map((claim) => claim.body) ?? []),
      ...(section.marginalia?.flatMap((item) => [item.label, item.value]) ??
        []),
      ...(section.pullQuote
        ? [section.pullQuote.quote, section.pullQuote.venue]
        : []),
    ]),
    ...page.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ];
  return fields.reduce(
    (result, field) => ({
      ...result,
      [field.status["fr-FR"]]: result[field.status["fr-FR"]] + 1,
    }),
    { current: 0, stale: 0, missing: 0 } satisfies Record<
      TranslationStatus,
      number
    >,
  );
}

export function PagePayloadEditor({
  rawValue,
  readOnly,
  onChange,
}: Readonly<{
  rawValue: string;
  readOnly: boolean;
  onChange: (rawValue: string) => void;
}>) {
  const page = parsePage(rawValue);
  if (!page) {
    return (
      <AdminEmptyState
        kind="content"
        title="No saved page content is loaded"
        description="Select Open and edit above first. If this is a new page, initialise a blank bilingual form; nothing is saved until you select Save as new draft."
        action={
          !readOnly ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => onChange(serialized(initialPage()))}
            >
              Initialise page fields
            </button>
          ) : undefined
        }
      />
    );
  }

  const counts = parity(page);
  const commit = (next: PageDraft) => onChange(serialized(next));
  const updateSection = (index: number, next: PageSection) =>
    commit({
      ...page,
      sections: page.sections.map((section, current) =>
        current === index ? next : section,
      ),
    });

  return (
    <div className="page-form">
      <div className="parity-summary" aria-label="French translation parity">
        <div>
          <strong>{counts.current}</strong>
          <span>Current</span>
        </div>
        <div>
          <strong>{counts.stale}</strong>
          <span>Stale</span>
        </div>
        <div>
          <strong>{counts.missing}</strong>
          <span>Missing</span>
        </div>
      </div>

      <div className="page-settings">
        <div className="field">
          <label htmlFor="page-slug">Page path</label>
          <input
            id="page-slug"
            value={page.slug}
            onChange={(event) => commit({ ...page, slug: event.target.value })}
            readOnly={readOnly}
          />
        </div>
        <GovernedMediaPicker
          id="page-og-image"
          label="Open Graph image"
          value={page.ogImage}
          readOnly={readOnly}
          resourceType="image"
          onChange={(value) => commit({ ...page, ogImage: String(value) })}
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={page.noIndex}
            onChange={(event) =>
              commit({ ...page, noIndex: event.target.checked })
            }
            disabled={readOnly}
          />
          Exclude from search indexing
        </label>
      </div>

      <LocalizedEditor
        id="page-title"
        label="Page title"
        field={page.title}
        readOnly={readOnly}
        onChange={(title) => commit({ ...page, title })}
      />
      <LocalizedEditor
        id="page-summary"
        label="Page summary"
        field={page.summary}
        multiline
        readOnly={readOnly}
        onChange={(summary) => commit({ ...page, summary })}
      />

      <section className="section-editor" aria-labelledby="sections-heading">
        <div className="section-editor__heading">
          <h3 id="sections-heading">Sections</h3>
          {!readOnly ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                commit({
                  ...page,
                  sections: [
                    ...page.sections,
                    {
                      key: `section-${page.sections.length + 1}`,
                      heading: localizedField(),
                      body: localizedField(),
                      sourceRefs: [],
                    },
                  ],
                })
              }
            >
              Add section
            </button>
          ) : null}
        </div>
        {page.sections.map((section, index) => (
          <article key={`${section.key}-${index}`}>
            <div className="section-key-row">
              <div className="field">
                <label htmlFor={`section-${index}-key`}>Section key</label>
                <input
                  id={`section-${index}-key`}
                  value={section.key}
                  onChange={(event) =>
                    updateSection(index, {
                      ...section,
                      key: event.target.value,
                    })
                  }
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && page.sections.length > 1 ? (
                <button
                  className="danger-button"
                  type="button"
                  onClick={() =>
                    commit({
                      ...page,
                      sections: page.sections.filter(
                        (_, current) => current !== index,
                      ),
                    })
                  }
                >
                  Remove section
                </button>
              ) : null}
            </div>
            <div className="page-settings">
              <div className="field">
                <AdminSelect
                  label="Record chapter"
                  value={section.recordAct ?? ""}
                  onChange={(event) => {
                    const withoutRecordAct = { ...section };
                    delete withoutRecordAct.recordAct;
                    updateSection(
                      index,
                      event.target.value
                        ? {
                            ...withoutRecordAct,
                            recordAct: event.target.value as NonNullable<
                              PageSection["recordAct"]
                            >,
                          }
                        : withoutRecordAct,
                    );
                  }}
                  disabled={readOnly}
                >
                  <option value="">Not a Record act</option>
                  <option value="forest">The Forest</option>
                  <option value="system">The System</option>
                  <option value="lite">The Lite</option>
                  <option value="return">The Return</option>
                </AdminSelect>
              </div>
              <GovernedMediaPicker
                id={`section-${index}-field-image`}
                label="Field image"
                value={section.fieldImage}
                readOnly={readOnly}
                resourceType="image"
                onChange={(value) => {
                  const fieldImage = String(value);
                  const nextSection = { ...section };
                  if (fieldImage) nextSection.fieldImage = fieldImage;
                  else delete nextSection.fieldImage;
                  updateSection(index, nextSection);
                }}
              />
            </div>
            {section.dateline ? (
              <LocalizedEditor
                id={`section-${index}-dateline`}
                label="Act dateline"
                field={section.dateline}
                readOnly={readOnly}
                onChange={(dateline) =>
                  updateSection(index, { ...section, dateline })
                }
              />
            ) : !readOnly && section.recordAct ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  updateSection(index, {
                    ...section,
                    dateline: localizedField(),
                    imageCaption: localizedField(),
                  })
                }
              >
                Add Record dateline and image caption
              </button>
            ) : null}
            {section.imageCaption ? (
              <LocalizedEditor
                id={`section-${index}-image-caption`}
                label="Field image caption"
                field={section.imageCaption}
                readOnly={readOnly}
                onChange={(imageCaption) =>
                  updateSection(index, { ...section, imageCaption })
                }
              />
            ) : null}
            {section.heading ? (
              <LocalizedEditor
                id={`section-${index}-heading`}
                label="Section heading"
                field={section.heading}
                readOnly={readOnly}
                onChange={(heading) =>
                  updateSection(index, { ...section, heading })
                }
              />
            ) : null}
            <LocalizedEditor
              id={`section-${index}-body`}
              label="Section body"
              field={section.body}
              multiline
              readOnly={readOnly}
              onChange={(body) => updateSection(index, { ...section, body })}
            />
            <div className="field">
              <label htmlFor={`section-${index}-sources`}>
                Source references
              </label>
              <input
                id={`section-${index}-sources`}
                value={section.sourceRefs.join(", ")}
                onChange={(event) =>
                  updateSection(index, {
                    ...section,
                    sourceRefs: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                readOnly={readOnly}
              />
              <p className="field-help">
                Comma-separated Source Register references.
              </p>
            </div>
            <section className="section-editor" aria-label="Sourced claims">
              <div className="section-editor__heading">
                <h4>Sourced narrative claims</h4>
                {!readOnly ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      updateSection(index, {
                        ...section,
                        claims: [
                          ...(section.claims ?? []),
                          { body: localizedField(), sourceRefs: [] },
                        ],
                      })
                    }
                  >
                    Add claim
                  </button>
                ) : null}
              </div>
              {(section.claims ?? []).map((claim, claimIndex) => (
                <div key={`claim-${claimIndex}`}>
                  <LocalizedEditor
                    id={`section-${index}-claim-${claimIndex}`}
                    label={`Claim ${claimIndex + 1}`}
                    field={claim.body}
                    multiline
                    readOnly={readOnly}
                    onChange={(body) =>
                      updateSection(index, {
                        ...section,
                        claims: (section.claims ?? []).map((item, current) =>
                          current === claimIndex ? { ...item, body } : item,
                        ),
                      })
                    }
                  />
                  <div className="field">
                    <label
                      htmlFor={`section-${index}-claim-${claimIndex}-sources`}
                    >
                      Claim source references
                    </label>
                    <input
                      id={`section-${index}-claim-${claimIndex}-sources`}
                      value={claim.sourceRefs.join(", ")}
                      onChange={(event) =>
                        updateSection(index, {
                          ...section,
                          claims: (section.claims ?? []).map((item, current) =>
                            current === claimIndex
                              ? {
                                  ...item,
                                  sourceRefs: event.target.value
                                    .split(",")
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                                }
                              : item,
                          ),
                        })
                      }
                      readOnly={readOnly}
                    />
                  </div>
                </div>
              ))}
            </section>
            <section className="section-editor" aria-label="Act marginalia">
              <div className="section-editor__heading">
                <h4>Marginalia</h4>
                {!readOnly && (section.marginalia?.length ?? 0) < 6 ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      updateSection(index, {
                        ...section,
                        marginalia: [
                          ...(section.marginalia ?? []),
                          {
                            label: localizedField(),
                            value: localizedField(),
                            sourceRefs: [],
                          },
                        ],
                      })
                    }
                  >
                    Add marginal note
                  </button>
                ) : null}
              </div>
              {(section.marginalia ?? []).map((item, itemIndex) => (
                <div key={`marginalia-${itemIndex}`}>
                  <LocalizedEditor
                    id={`section-${index}-marginalia-${itemIndex}-label`}
                    label={`Marginal note ${itemIndex + 1} label`}
                    field={item.label}
                    readOnly={readOnly}
                    onChange={(label) =>
                      updateSection(index, {
                        ...section,
                        marginalia: (section.marginalia ?? []).map(
                          (entry, current) =>
                            current === itemIndex ? { ...entry, label } : entry,
                        ),
                      })
                    }
                  />
                  <LocalizedEditor
                    id={`section-${index}-marginalia-${itemIndex}-value`}
                    label={`Marginal note ${itemIndex + 1} value`}
                    field={item.value}
                    readOnly={readOnly}
                    onChange={(value) =>
                      updateSection(index, {
                        ...section,
                        marginalia: (section.marginalia ?? []).map(
                          (entry, current) =>
                            current === itemIndex ? { ...entry, value } : entry,
                        ),
                      })
                    }
                  />
                  <GovernedMediaPicker
                    id={`section-${index}-marginalia-${itemIndex}-image`}
                    label={`Marginal note ${itemIndex + 1} image`}
                    value={item.image}
                    readOnly={readOnly}
                    resourceType="image"
                    onChange={(value) => {
                      const image = String(value);
                      updateSection(index, {
                        ...section,
                        marginalia: (section.marginalia ?? []).map(
                          (entry, current) => {
                            if (current !== itemIndex) return entry;
                            const nextEntry = { ...entry };
                            if (image) nextEntry.image = image;
                            else delete nextEntry.image;
                            return nextEntry;
                          },
                        ),
                      });
                    }}
                  />
                  <div className="field">
                    <label
                      htmlFor={`section-${index}-marginalia-${itemIndex}-sources`}
                    >
                      Marginal note source references
                    </label>
                    <input
                      id={`section-${index}-marginalia-${itemIndex}-sources`}
                      value={item.sourceRefs.join(", ")}
                      onChange={(event) =>
                        updateSection(index, {
                          ...section,
                          marginalia: (section.marginalia ?? []).map(
                            (entry, current) =>
                              current === itemIndex
                                ? {
                                    ...entry,
                                    sourceRefs: event.target.value
                                      .split(",")
                                      .map((value) => value.trim())
                                      .filter(Boolean),
                                  }
                                : entry,
                          ),
                        })
                      }
                      readOnly={readOnly}
                    />
                  </div>
                </div>
              ))}
            </section>
            {section.pullQuote ? (
              <section
                className="section-editor"
                aria-label="Verified pull quote"
              >
                <h4>Verified pull quote</h4>
                <LocalizedEditor
                  id={`section-${index}-pull-quote`}
                  label="Quote"
                  field={section.pullQuote.quote}
                  multiline
                  readOnly={readOnly}
                  onChange={(quote) =>
                    updateSection(index, {
                      ...section,
                      pullQuote: { ...section.pullQuote!, quote },
                    })
                  }
                />
                <LocalizedEditor
                  id={`section-${index}-pull-venue`}
                  label="Venue"
                  field={section.pullQuote.venue}
                  readOnly={readOnly}
                  onChange={(venue) =>
                    updateSection(index, {
                      ...section,
                      pullQuote: { ...section.pullQuote!, venue },
                    })
                  }
                />
                <div className="page-settings">
                  <div className="field">
                    <label htmlFor={`section-${index}-pull-date`}>Date</label>
                    <input
                      id={`section-${index}-pull-date`}
                      type="date"
                      value={section.pullQuote.date.slice(0, 10)}
                      onChange={(event) =>
                        updateSection(index, {
                          ...section,
                          pullQuote: {
                            ...section.pullQuote!,
                            date: event.target.value,
                          },
                        })
                      }
                      readOnly={readOnly}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`section-${index}-pull-source`}>
                      Source reference
                    </label>
                    <input
                      id={`section-${index}-pull-source`}
                      value={section.pullQuote.sourceRef}
                      onChange={(event) =>
                        updateSection(index, {
                          ...section,
                          pullQuote: {
                            ...section.pullQuote!,
                            sourceRef: event.target.value,
                          },
                        })
                      }
                      readOnly={readOnly}
                    />
                  </div>
                </div>
              </section>
            ) : !readOnly && section.recordAct ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  updateSection(index, {
                    ...section,
                    pullQuote: {
                      quote: localizedField(),
                      venue: localizedField(),
                      date: new Date().toISOString(),
                      sourceRef: "",
                    },
                  })
                }
              >
                Add verified pull quote
              </button>
            ) : null}
          </article>
        ))}
      </section>

      <section className="section-editor" aria-labelledby="faqs-heading">
        <div className="section-editor__heading">
          <div>
            <h3 id="faqs-heading">Governed FAQs</h3>
            <p>
              Only approved, source-linked answers are eligible for public
              FAQPage structured data.
            </p>
          </div>
          {!readOnly && page.faqs.length < 20 ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                commit({
                  ...page,
                  faqs: [
                    ...page.faqs,
                    {
                      question: localizedField(),
                      answer: localizedField(),
                      sourceRefs: [],
                    },
                  ],
                })
              }
            >
              Add FAQ
            </button>
          ) : null}
        </div>
        {page.faqs.map((faq, index) => (
          <article key={`faq-${index}`}>
            <div className="section-editor__heading">
              <h4>FAQ {index + 1}</h4>
              {!readOnly ? (
                <button
                  className="danger-button"
                  type="button"
                  onClick={() =>
                    commit({
                      ...page,
                      faqs: page.faqs.filter((_, current) => current !== index),
                    })
                  }
                >
                  Remove FAQ
                </button>
              ) : null}
            </div>
            <LocalizedEditor
              id={`faq-${index}-question`}
              label="FAQ question"
              field={faq.question}
              readOnly={readOnly}
              onChange={(question) =>
                commit({
                  ...page,
                  faqs: page.faqs.map((item, current) =>
                    current === index ? { ...item, question } : item,
                  ),
                })
              }
            />
            <LocalizedEditor
              id={`faq-${index}-answer`}
              label="FAQ answer"
              field={faq.answer}
              multiline
              readOnly={readOnly}
              onChange={(answer) =>
                commit({
                  ...page,
                  faqs: page.faqs.map((item, current) =>
                    current === index ? { ...item, answer } : item,
                  ),
                })
              }
            />
            <div className="field">
              <label htmlFor={`faq-${index}-sources`}>FAQ source IDs</label>
              <input
                id={`faq-${index}-sources`}
                value={faq.sourceRefs.join(", ")}
                onChange={(event) =>
                  commit({
                    ...page,
                    faqs: page.faqs.map((item, current) =>
                      current === index
                        ? {
                            ...item,
                            sourceRefs: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          }
                        : item,
                    ),
                  })
                }
                readOnly={readOnly}
              />
            </div>
          </article>
        ))}
      </section>

      <section className="seo-editor" aria-labelledby="seo-heading">
        <h3 id="seo-heading">Search metadata</h3>
        <LocalizedEditor
          id="seo-title"
          label="SEO title"
          field={page.seoTitle}
          readOnly={readOnly}
          onChange={(seoTitle) => commit({ ...page, seoTitle })}
        />
        <LocalizedEditor
          id="seo-description"
          label="SEO description"
          field={page.seoDescription}
          multiline
          readOnly={readOnly}
          onChange={(seoDescription) => commit({ ...page, seoDescription })}
        />
      </section>
    </div>
  );
}
