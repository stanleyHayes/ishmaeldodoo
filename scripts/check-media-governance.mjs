import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  contentSchemas,
  schemaEditor,
  pageEditor,
  mediaPicker,
  mediaWorkspace,
  cloudinaryService,
  cmsService,
  mediaReferenceService,
  mediaRepository,
  cmsRepository,
] = await Promise.all([
  readFile("apps/api/src/modules/content/domain/schemas.ts", "utf8"),
  readFile(
    "apps/admin/src/components/content/schema-payload-editor.tsx",
    "utf8",
  ),
  readFile("apps/admin/src/components/content/page-payload-editor.tsx", "utf8"),
  readFile("apps/admin/src/components/media/governed-media-picker.tsx", "utf8"),
  readFile("apps/admin/src/components/media/media-workspace.tsx", "utf8"),
  readFile(
    "apps/api/src/modules/media/infrastructure/cloudinary.service.ts",
    "utf8",
  ),
  readFile("apps/api/src/modules/content/application/cms.service.ts", "utf8"),
  readFile(
    "apps/api/src/modules/media/application/media-reference.service.ts",
    "utf8",
  ),
  readFile(
    "apps/api/src/modules/media/persistence/media.repository.ts",
    "utf8",
  ),
  readFile(
    "apps/api/src/modules/content/persistence/cms.repository.ts",
    "utf8",
  ),
]);

function validate(
  schema,
  editor,
  page,
  picker,
  workspace,
  provider,
  cms,
  referenceService,
  repository,
  contentRepository,
) {
  assert.match(
    schema,
    /portraits: z\.array\(z\.string\(\)\.uuid\(\)\)\.max\(3\)/u,
    "Profile portraits must contain governed UUID references, not URLs",
  );
  for (const field of ["image", "photo", "fieldImage", "ogImage"])
    assert.match(
      schema,
      new RegExp(`${field}: z\\.string\\(\\)\\.uuid\\(\\)`, "u"),
      `${field} must remain a governed UUID reference`,
    );
  assert.doesNotMatch(
    schema,
    /(?:profileImage|portrait|avatar|image|photo)(?:Url|URL):\s*z\./u,
    "Content may not expose an authored image URL field",
  );
  for (const field of ["portraits", "image", "photo", "assetId"])
    assert.match(
      editor,
      new RegExp(`key: "${field}"[\\s\\S]{0,140}type: "mediaAsset(?:s)?"`, "u"),
      `${field} must use the governed media selector`,
    );
  assert.match(editor, /mediaFolder: "portraits"/u);
  assert.match(editor, /mediaResourceType: "image"/u);
  assert.match(page, /id="page-og-image"[\s\S]{0,160}resourceType="image"/u);
  assert.match(
    page,
    /id=\{`section-\$\{index\}-field-image`\}[\s\S]{0,180}resourceType="image"/u,
  );
  assert.match(
    page,
    /id=\{`section-\$\{index\}-marginalia-\$\{itemIndex\}-image`\}[\s\S]{0,180}resourceType="image"/u,
  );
  assert.doesNotMatch(
    page,
    /<input[\s\S]{0,100}(?:page-og-image|field-image)/u,
  );
  assert.match(picker, /listMediaAssets\(/u);
  assert.match(
    picker,
    /listMediaAssets\(\{[\s\S]{0,80}limit: 1,[\s\S]{0,40}assetId/u,
    "Selected assets outside the first library page must be resolved exactly",
  );
  assert.match(
    editor,
    /parentItem\?\.kind === "image"[\s\S]{0,100}parentItem\?\.kind === "video"/u,
    "Nested Speaking media must filter the governed library by media kind",
  );
  assert.match(picker, /local file[\s\S]{0,100}uploaded through Media first/u);
  assert.match(picker, /URLs and pasted asset IDs[\s\S]{0,30}not accepted/u);
  assert.doesNotMatch(picker, /<input/u);
  assert.match(workspace, /namedItem\("file"\)/u);
  assert.match(workspace, /uploadMediaAsset\(file\.files\[0\]/u);
  assert.match(provider, /cloudinary\.api\.resource\(publicId/u);
  assert.match(
    cms,
    /assertPublishedMedia\([\s\S]{0,30}documentType,[\s\S]{0,30}version\.payload/u,
    "Publication must validate governed media before persistence",
  );
  assert.match(
    cms,
    /assertPublishedMedia\([\s\S]{0,30}documentType,[\s\S]{0,30}target\.payload/u,
    "Rollback must revalidate governed media before persistence",
  );
  assert.match(referenceService, /asset\.status !== "active"/u);
  assert.match(
    referenceService,
    /asset\.resourceType !== reference\.resourceType/u,
  );
  assert.match(referenceService, /amanor\/\$\{reference\.folder\}\//u);
  assert.match(
    repository,
    /assetId: \{ \$in: \[\.\.\.new Set\(assetIds\)\] \}/u,
  );
  assert.match(contentRepository, /"media_reference_locks"/u);
  assert.match(contentRepository, /mediaReferences\s*\?\?\s*\[\]/u);
  assert.match(repository, /claimManualDeletion\(/u);
  assert.match(repository, /claimRetentionIfUnreferenced\(/u);
  assert.match(repository, /"media_reference_locks"/u);
}

const validSources = [
  contentSchemas,
  schemaEditor,
  pageEditor,
  mediaPicker,
  mediaWorkspace,
  cloudinaryService,
  cmsService,
  mediaReferenceService,
  mediaRepository,
  cmsRepository,
];
validate(...validSources);

for (const [name, values] of [
  [
    "URL-backed identity portrait",
    validSources.map((source, index) =>
      index === 0
        ? source.replace(
            "portraits: z.array(z.string().uuid()).max(3)",
            "portraits: z.array(z.url()).max(3)",
          )
        : source,
    ),
  ],
  [
    "free-text portrait entry",
    validSources.map((source, index) =>
      index === 1
        ? source.replace('type: "mediaAssets"', 'type: "strings"')
        : source,
    ),
  ],
  [
    "free-text page image",
    validSources.map((source, index) =>
      index === 2 ? source.replace("<GovernedMediaPicker", "<input") : source,
    ),
  ],
  [
    "missing local file input",
    validSources.map((source, index) =>
      index === 4
        ? source.replace('namedItem("file")', 'namedItem("url")')
        : source,
    ),
  ],
  [
    "inactive media publication bypass",
    validSources.map((source, index) =>
      index === 7
        ? source.replace('asset.status !== "active"', "false")
        : source,
    ),
  ],
  [
    "non-atomic publication media check",
    validSources.map((source, index) =>
      index === 9
        ? source.replace('"media_reference_locks"', '"uncoordinated_locks"')
        : source,
    ),
  ],
]) {
  assert.throws(
    () => validate(...values),
    undefined,
    `${name} fixture must fail media governance`,
  );
}

process.stdout.write(
  "All CMS image fields require local-file upload, governed Cloudinary selection and atomic publication-time registry validation; six unsafe fixtures rejected.\n",
);
