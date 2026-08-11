"use client";

import type { MediaAsset, MediaAssetListQuery } from "@amanor/contracts";
import { useEffect, useState } from "react";
import { listMediaAssets } from "../../lib/api/client";

export function GovernedMediaPicker({
  id,
  label,
  value,
  readOnly,
  multiple = false,
  maximum = 1,
  folder,
  resourceType,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string | readonly string[] | undefined;
  readOnly: boolean;
  multiple?: boolean;
  maximum?: number;
  folder?: MediaAssetListQuery["folder"];
  resourceType?: MediaAssetListQuery["resourceType"];
  onChange: (value: string | readonly string[]) => void;
}>) {
  const [assets, setAssets] = useState<readonly MediaAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unavailableSelection, setUnavailableSelection] = useState(false);
  const selected = multiple
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === "string"
      ? value
      : "";
  const selectedIds = Array.isArray(selected)
    ? selected
    : selected
      ? [selected]
      : [];
  const selectionKey = selectedIds.join(",");

  useEffect(() => {
    let subscribed = true;
    const requestedIds = selectionKey ? selectionKey.split(",") : [];
    const filters = {
      ...(folder ? { folder } : {}),
      ...(resourceType ? { resourceType } : {}),
    };
    void (async () => {
      const page = await listMediaAssets({ limit: 100, ...filters });
      const present = new Set(page.items.map((asset) => asset.assetId));
      const missingIds = requestedIds.filter(
        (assetId) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            assetId,
          ) && !present.has(assetId),
      );
      const selectedPages = await Promise.all(
        missingIds.map((assetId) =>
          listMediaAssets({ limit: 1, assetId, ...filters }),
        ),
      );
      return [
        ...page.items,
        ...selectedPages.flatMap((selectedPage) => selectedPage.items),
      ];
    })().then(
      (items) => {
        if (!subscribed) return;
        const uniqueItems = Array.from(
          new Map(items.map((asset) => [asset.assetId, asset])).values(),
        );
        setAssets(uniqueItems);
        const availableIds = new Set(uniqueItems.map((asset) => asset.assetId));
        setUnavailableSelection(
          requestedIds.some((assetId) => !availableIds.has(assetId)),
        );
        setError(null);
      },
      () => {
        if (subscribed) {
          setError(
            "The governed media library is unavailable. Upload the local file in Media and try again.",
          );
          setUnavailableSelection(false);
        }
      },
    );
    return () => {
      subscribed = false;
    };
  }, [folder, resourceType, selectionKey]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        multiple={multiple}
        size={multiple ? Math.min(7, Math.max(3, assets.length)) : undefined}
        value={selected}
        disabled={readOnly}
        onChange={(event) =>
          onChange(
            multiple
              ? Array.from(event.currentTarget.selectedOptions)
                  .map((option) => option.value)
                  .slice(0, maximum)
              : event.currentTarget.value,
          )
        }
      >
        {!multiple ? <option value="">No media selected</option> : null}
        {assets.map((asset) => (
          <option key={asset.assetId} value={asset.assetId}>
            {asset.altText["en-GB"]} · {asset.publicId}
          </option>
        ))}
      </select>
      <p className="field-help">
        Choose from the governed library. New media must be selected from a
        local file and uploaded through Media first; URLs and pasted asset IDs
        are not accepted.
      </p>
      {error ? <p className="error-message">{error}</p> : null}
      {unavailableSelection ? (
        <p className="error-message">
          A selected asset is no longer active or does not match this media
          field. Choose another governed asset before saving.
        </p>
      ) : null}
    </div>
  );
}
