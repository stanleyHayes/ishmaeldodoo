import { foundationMigration } from "./changes/20260809_001_foundation";
import { rateLimitMigration } from "./changes/20260809_002_rate_limits";
import { mediaAssetsMigration } from "./changes/20260809_003_media_assets";
import { pressKitRequestsMigration } from "./changes/20260809_004_press_kit_requests";
import { mediaEnquiriesMigration } from "./changes/20260809_005_media_enquiries";
import { livingDossierRequestsMigration } from "./changes/20260809_006_living_dossier_requests";
import { protocolDeskMigration } from "./changes/20260809_007_protocol_desk";
import { revalidationClaimsMigration } from "./changes/20260810_008_revalidation_claims";
import { authInvitationsMigration } from "./changes/20260810_009_auth_invitations";
import { authAuditMigration } from "./changes/20260810_010_auth_audit";
import { authAuditIntegrityMigration } from "./changes/20260810_011_auth_audit_integrity";
import { publicationFeedsMigration } from "./changes/20260810_012_publication_feeds";
import { contactEnquiriesMigration } from "./changes/20260810_013_contact_enquiries";
import { mediaLibraryMigration } from "./changes/20260810_014_media_library";
import { editorialAuditIntegrityMigration } from "./changes/20260810_015_editorial_audit_integrity";
import { biographySourcesMigration } from "./changes/20260810_016_biography_sources";
import { protocolCorrespondenceMigration } from "./changes/20260810_017_protocol_correspondence";
import { protocolSlaMigration } from "./changes/20260810_018_protocol_sla";
import { protocolAccessAuditMigration } from "./changes/20260810_019_protocol_access_audit";
import { refreshTokenConsumptionsMigration } from "./changes/20260810_020_refresh_token_consumptions";
import { contentCollectionIndexesMigration } from "./changes/20260810_021_content_collection_indexes";
import { coreContentIndexesMigration } from "./changes/20260810_022_core_content_indexes";
import { identityTitleHistoryMigration } from "./changes/20260810_023_identity_title_history";
import { operationalContentIndexesMigration } from "./changes/20260810_024_operational_content_indexes";
import { structuredPublicationProjectionsMigration } from "./changes/20260810_025_structured_publication_projections";
import { protocolRetentionMigration } from "./changes/20260810_026_protocol_retention";
import { authNotificationJobsMigration } from "./changes/20260810_027_auth_notification_jobs";
import { calendarSyncJobsMigration } from "./changes/20260810_028_calendar_sync_jobs";
import { mediaRetentionMigration } from "./changes/20260810_029_media_retention";
import { protocolDecisionCapabilitiesMigration } from "./changes/20260810_030_protocol_decision_capabilities";
import { principalDecisionDeliveriesMigration } from "./changes/20260811_031_principal_decision_deliveries";
import { webAuthnHardwareKeysMigration } from "./changes/20260811_032_webauthn_hardware_keys";
import type { MongoMigration } from "./types";

export const migrations = [
  foundationMigration,
  rateLimitMigration,
  mediaAssetsMigration,
  pressKitRequestsMigration,
  mediaEnquiriesMigration,
  livingDossierRequestsMigration,
  protocolDeskMigration,
  revalidationClaimsMigration,
  authInvitationsMigration,
  authAuditMigration,
  authAuditIntegrityMigration,
  publicationFeedsMigration,
  contactEnquiriesMigration,
  mediaLibraryMigration,
  editorialAuditIntegrityMigration,
  biographySourcesMigration,
  protocolCorrespondenceMigration,
  protocolSlaMigration,
  protocolAccessAuditMigration,
  refreshTokenConsumptionsMigration,
  contentCollectionIndexesMigration,
  coreContentIndexesMigration,
  identityTitleHistoryMigration,
  operationalContentIndexesMigration,
  structuredPublicationProjectionsMigration,
  protocolRetentionMigration,
  authNotificationJobsMigration,
  calendarSyncJobsMigration,
  mediaRetentionMigration,
  protocolDecisionCapabilitiesMigration,
  principalDecisionDeliveriesMigration,
  webAuthnHardwareKeysMigration,
] as const satisfies readonly MongoMigration[];

export function assertMigrationRegistry(
  registry: readonly MongoMigration[],
): void {
  const ids = registry.map((migration) => migration.id);
  const uniqueIds = new Set(ids);

  if (uniqueIds.size !== ids.length) {
    throw new Error("MongoDB migration IDs must be unique");
  }

  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (ids.some((id, index) => id !== sorted[index])) {
    throw new Error(
      "MongoDB migrations must be registered in ascending ID order",
    );
  }
}
