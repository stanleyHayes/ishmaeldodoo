"use client";

import type {
  MediaAsset,
  MediaCompleteRequest,
  MediaInventoryReport,
  MediaMetadataUpdate,
  MediaSignRequest,
} from "@amanor/contracts";
import { AdminSelect } from "../ui/admin-select";
import {
  AdminEmptyState,
  AdminNotice,
  AdminSkeleton,
  BusyLabel,
} from "../ui/admin-state";
import { AdminTemporalField } from "../ui/admin-temporal-field";
import { useEffect, useState } from "react";
import {
  ApiClientError,
  deleteMediaAsset,
  getMediaInventory,
  listMediaAssets,
  updateMediaAsset,
  uploadMediaAsset,
} from "../../lib/api/client";

const folders = [
  "portraits",
  "atlas",
  "archive",
  "speaking",
  "scholars",
  "press",
] as const;
const policies = ["portrait", "editorial", "atlas", "document"] as const;

type MediaError = Readonly<{ title: string; description: string }>;

function mediaError(error: unknown, title: string): MediaError {
  const requestReference =
    error instanceof ApiClientError && error.requestId
      ? ` Reference: ${error.requestId}.`
      : "";
  return {
    title,
    description: `${error instanceof ApiClientError ? error.message : "The service did not respond as expected."}${requestReference} Try again, or contact the technical team if this continues.`,
  };
}

function localized(en: string, fr: string) {
  return {
    "en-GB": en.trim(),
    "fr-FR": fr.trim(),
    status: {
      "en-GB": "current" as const,
      "fr-FR": fr.trim() ? ("current" as const) : ("missing" as const),
    },
    sourceUpdatedAt: new Date(),
  };
}

function metadataFrom(form: HTMLFormElement): MediaMetadataUpdate {
  const data = new FormData(form);
  const focal = data.get("useFocalPoint") === "on";
  return {
    altText: localized(
      String(data.get("altEn") ?? ""),
      String(data.get("altFr") ?? ""),
    ),
    credit: String(data.get("credit") ?? ""),
    sourceRef: String(data.get("sourceRef") ?? ""),
    ...(String(data.get("consentReference") ?? "").trim()
      ? { consentReference: String(data.get("consentReference")) }
      : {}),
    licence: String(data.get("licence") ?? ""),
    transformationPolicy: String(
      data.get("transformationPolicy") ?? "editorial",
    ) as MediaMetadataUpdate["transformationPolicy"],
    ...(focal
      ? {
          focalPoint: {
            x: Number(data.get("focalX")),
            y: Number(data.get("focalY")),
          },
        }
      : {}),
    retentionPolicy: String(
      data.get("retentionPolicy") ?? "standard",
    ) as MediaMetadataUpdate["retentionPolicy"],
    ...(String(data.get("retainUntil") ?? "").trim()
      ? { retainUntil: new Date(String(data.get("retainUntil"))) }
      : {}),
    legalHold: data.get("legalHold") === "on",
  };
}

export function MediaWorkspace() {
  const [assets, setAssets] = useState<readonly MediaAsset[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<MediaError | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [inventory, setInventory] = useState<MediaInventoryReport | null>(null);
  const [view, setView] = useState<"library" | "upload">("library");

  async function load(cursor?: string, append = false) {
    setLoading(true);
    setError(null);
    try {
      const page = await listMediaAssets({ ...(cursor ? { cursor } : {}) });
      setAssets((current) =>
        append ? [...current, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(mediaError(caught, "We couldn't open the media library"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let subscribed = true;
    void listMediaAssets({ limit: 25 }).then(
      (page) => {
        if (!subscribed) return;
        setAssets(page.items);
        setNextCursor(page.nextCursor);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!subscribed) return;
        setError(mediaError(caught, "We couldn't open the media library"));
        setLoading(false);
      },
    );
    return () => {
      subscribed = false;
    };
  }, []);

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = form.elements.namedItem("file") as HTMLInputElement | null;
    if (!file?.files?.[0]) return;
    const resourceType = String(
      data.get("resourceType"),
    ) as MediaSignRequest["resourceType"];
    const metadata = metadataFrom(form);
    if (metadata.focalPoint && resourceType !== "image") {
      setError({
        title: "Choose an image to use a focal point",
        description:
          "Focal points control image crops and cannot be applied to audio, video or documents.",
      });
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await uploadMediaAsset(file.files[0], {
        folder: String(data.get("folder")) as MediaSignRequest["folder"],
        resourceType,
        ...metadata,
      } satisfies Omit<MediaCompleteRequest, "publicId"> & {
        folder: MediaSignRequest["folder"];
      });
      form.reset();
      setMessage("Upload verified and added to the governed library.");
      await load();
      setView("library");
    } catch (caught) {
      setError(mediaError(caught, "We couldn't add this file"));
    } finally {
      setBusy(false);
    }
  }

  async function submitMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateMediaAsset(
        selected.assetId,
        metadataFrom(event.currentTarget),
      );
      setAssets((current) =>
        current.map((asset) =>
          asset.assetId === updated.assetId ? updated : asset,
        ),
      );
      setSelected(updated);
      setMessage("Governance and crop metadata saved.");
    } catch (caught) {
      setError(mediaError(caught, "We couldn't save the media details"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: MediaAsset) {
    if (pendingDelete !== asset.assetId) {
      setPendingDelete(asset.assetId);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMediaAsset(asset.assetId);
      setAssets((current) =>
        current.filter((item) => item.assetId !== asset.assetId),
      );
      if (selected?.assetId === asset.assetId) setSelected(null);
      setPendingDelete(null);
      setMessage(
        "Asset invalidated at Cloudinary and retired from the library.",
      );
    } catch (caught) {
      setError(mediaError(caught, "We couldn't retire this asset"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadInventory() {
    setBusy(true);
    setError(null);
    try {
      const report = await getMediaInventory();
      setInventory(report);
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `amanor-media-inventory-${report.generatedAt.toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Complete governed asset inventory downloaded.");
    } catch (caught) {
      setError(mediaError(caught, "We couldn't download the inventory"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-workspace">
      <aside className="admin-page-guide" aria-label="How to manage media">
        <div>
          <span>1</span>
          <p>
            <strong>Choose a file</strong>
            <small>
              Start with an approved local image, audio file, video or document.
            </small>
          </p>
        </div>
        <div>
          <span>2</span>
          <p>
            <strong>Add its details</strong>
            <small>
              Record the source, permission, description and retention rule.
            </small>
          </p>
        </div>
        <div>
          <span>3</span>
          <p>
            <strong>Find it below</strong>
            <small>
              Edit details or retire the asset from the governed library.
            </small>
          </p>
        </div>
      </aside>
      <nav className="admin-task-switcher" aria-label="Media tasks">
        <button
          type="button"
          aria-current={view === "library" ? "page" : undefined}
          onClick={() => setView("library")}
        >
          <strong>Media library</strong>
          <small>Browse and update approved files</small>
        </button>
        <button
          type="button"
          aria-current={view === "upload" ? "page" : undefined}
          onClick={() => setView("upload")}
        >
          <strong>Add new media</strong>
          <small>Register a file and its permissions</small>
        </button>
      </nav>
      {error ? (
        <AdminNotice
          tone="error"
          title={error.title}
          description={error.description}
          action={
            <button
              type="button"
              className="text-button"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          }
        />
      ) : null}
      {message ? <AdminNotice tone="success" title={message} /> : null}

      {view === "upload" ? (
        <section className="media-intake" aria-labelledby="media-upload-title">
          <header className="media-intake__header">
            <div>
              <p className="section-context">Asset intake / 01</p>
              <h2 id="media-upload-title">Register a governed asset</h2>
            </div>
            <p>
              Files travel directly to the media vault on a short-lived
              signature. The API verifies provenance, usage and retention before
              registration.
            </p>
          </header>
          <MediaMetadataForm onSubmit={submitUpload} busy={busy} upload />
        </section>
      ) : null}

      {view === "library" ? (
        <section
          className="media-catalogue"
          aria-labelledby="media-library-title"
        >
          <div className="media-catalogue__header">
            <div>
              <p className="section-context">Governed library / 02</p>
              <h2 id="media-library-title">Media library</h2>
            </div>
            <span
              className="media-catalogue__count"
              aria-label={`${assets.length} loaded assets`}
            >
              {String(assets.length).padStart(2, "0")}
            </span>
          </div>
          <div className="media-inventory-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void downloadInventory()}
            >
              Download asset inventory
            </button>
            {inventory ? (
              <p role="status">
                {inventory.totals.assets} assets · {inventory.totals.published}{" "}
                published · {inventory.totals.actionRequired} require action
              </p>
            ) : null}
          </div>
          {loading && assets.length === 0 ? (
            <AdminSkeleton variant="media" label="Loading governed media" />
          ) : null}
          {!loading && assets.length === 0 ? (
            <AdminEmptyState
              kind="media"
              title="No media has been added yet"
              description="Use the form above to add an approved image, audio file, video or document. It will appear here after its source, permission and retention details are saved."
              action={
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setView("upload")}
                >
                  Add the first file
                </button>
              }
            />
          ) : null}
          <div className="media-library-grid">
            {assets.map((asset) => (
              <article key={asset.assetId} className="media-library-card">
                {asset.resourceType === "image" ? (
                  // Cloudinary URL was verified server-side before persistence.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.secureUrl} alt={asset.altText["en-GB"]} />
                ) : (
                  <div className="media-file-mark" aria-hidden="true">
                    {asset.resourceType.toUpperCase()}
                  </div>
                )}
                <div>
                  <strong>{asset.altText["en-GB"]}</strong>
                  <p>{asset.publicId}</p>
                  <small>
                    {asset.format.toUpperCase()} ·{" "}
                    {(asset.bytes / 1024).toFixed(1)} KB ·{" "}
                    {asset.transformationPolicy} · {asset.retentionPolicy}
                    {asset.legalHold ? " · legal hold" : ""}
                  </small>
                </div>
                <div className="media-card-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelected(asset)}
                  >
                    Edit metadata and crop
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={
                      busy ||
                      asset.legalHold ||
                      asset.retentionPolicy === "permanent"
                    }
                    onClick={() => void remove(asset)}
                  >
                    {asset.legalHold || asset.retentionPolicy === "permanent"
                      ? "Protected from retirement"
                      : pendingDelete === asset.assetId
                        ? "Confirm retirement"
                        : "Retire asset"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {loading && assets.length > 0 ? (
            <AdminSkeleton
              variant="media"
              label="Loading more governed media"
            />
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              className="secondary-button"
              disabled={loading}
              onClick={() => void load(nextCursor, true)}
            >
              Load more
            </button>
          ) : null}
        </section>
      ) : null}

      {selected ? (
        <section className="work-queue" aria-labelledby="media-edit-title">
          <div>
            <p className="section-context">Non-destructive crop control</p>
            <h2 id="media-edit-title">Edit {selected.publicId}</h2>
          </div>
          <MediaMetadataForm
            key={`${selected.assetId}-${selected.updatedAt?.toISOString() ?? "new"}`}
            asset={selected}
            onSubmit={submitMetadata}
            busy={busy}
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setSelected(null)}
          >
            Close editor
          </button>
        </section>
      ) : null}
    </div>
  );
}

function MediaMetadataForm({
  asset,
  onSubmit,
  busy,
  upload = false,
}: Readonly<{
  asset?: MediaAsset;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  upload?: boolean;
}>) {
  const image = upload || asset?.resourceType === "image";
  return (
    <form
      className="media-governance-form"
      onSubmit={onSubmit}
      aria-busy={busy}
    >
      {upload ? (
        <>
          <label>
            File
            <input name="file" type="file" required disabled={busy} />
          </label>
          <AdminSelect
            label="Library folder"
            name="folder"
            defaultValue="press"
          >
            {folders.map((folder) => (
              <option key={folder}>{folder}</option>
            ))}
          </AdminSelect>
          <AdminSelect
            label="Resource type"
            name="resourceType"
            defaultValue="image"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="raw">Document/raw</option>
          </AdminSelect>
        </>
      ) : null}
      <label>
        English alt text
        <input name="altEn" required defaultValue={asset?.altText["en-GB"]} />
      </label>
      <label>
        French alt text
        <input name="altFr" defaultValue={asset?.altText["fr-FR"]} />
      </label>
      <label>
        Credit
        <input name="credit" required defaultValue={asset?.credit} />
      </label>
      <label>
        Source reference
        <input name="sourceRef" required defaultValue={asset?.sourceRef} />
      </label>
      <label>
        Consent reference
        <input name="consentReference" defaultValue={asset?.consentReference} />
      </label>
      <label>
        Licence / usage terms
        <input name="licence" required defaultValue={asset?.licence} />
      </label>
      <AdminSelect
        label="Transformation policy"
        name="transformationPolicy"
        defaultValue={asset?.transformationPolicy ?? "editorial"}
      >
        {policies.map((policy) => (
          <option key={policy}>{policy}</option>
        ))}
      </AdminSelect>
      <AdminSelect
        label="Retention policy"
        name="retentionPolicy"
        defaultValue={asset?.retentionPolicy ?? "standard"}
      >
        <option value="standard">Standard review</option>
        <option value="permanent">Permanent master</option>
        <option value="expires">Retain until date</option>
      </AdminSelect>
      <AdminTemporalField
        label="Retain until"
        name="retainUntil"
        mode="date"
        defaultValue={asset?.retainUntil?.toISOString().slice(0, 10) ?? ""}
      />
      <label>
        <input
          name="legalHold"
          type="checkbox"
          defaultChecked={asset?.legalHold ?? false}
        />{" "}
        Legal or records hold
      </label>
      {image ? (
        <fieldset className="focal-point-fields">
          <legend>Responsive crop focal point</legend>
          <label>
            <input
              name="useFocalPoint"
              type="checkbox"
              defaultChecked={Boolean(asset?.focalPoint)}
            />{" "}
            Use custom focal point
          </label>
          <label>
            Horizontal position
            <input
              name="focalX"
              type="range"
              min="0"
              max="1"
              step="0.01"
              defaultValue={asset?.focalPoint?.x ?? 0.5}
            />
          </label>
          <label>
            Vertical position
            <input
              name="focalY"
              type="range"
              min="0"
              max="1"
              step="0.01"
              defaultValue={asset?.focalPoint?.y ?? 0.5}
            />
          </label>
          <p className="field-help">
            The original remains unchanged. Delivery crops use this subject-safe
            focal point.
          </p>
        </fieldset>
      ) : null}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? (
          <BusyLabel label={upload ? "Registering asset" : "Saving metadata"} />
        ) : upload ? (
          "Upload and register"
        ) : (
          "Save metadata"
        )}
      </button>
    </form>
  );
}
