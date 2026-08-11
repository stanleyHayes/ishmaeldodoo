import { spawnSync } from "node:child_process";
import { acquireFixtureLock, releaseFixtureLock } from "./lib/fixture-lock.mjs";

const compose = [
  "compose",
  "-p",
  "infra",
  "-f",
  "infra/docker-compose.test.yml",
];
const container = "infra-mongo-test-1";
const sourceDatabase = "amanor_backup_source";
const restoredDatabase = "amanor_backup_restored";
const archive = "/tmp/amanor-backup.archive.gz";
const roomSourceDatabase = "amanor_room_backup_source";
const roomRestoredDatabase = "amanor_room_backup_restored";
const roomArchive = "/tmp/amanor-room-backup.archive.gz";
const roomDeletionEvidenceArchive =
  "/tmp/amanor-room-deletion-evidence.archive.gz";
const ttlCollections = [
  "contact_enquiries",
  "media_enquiries",
  "press_kit_requests",
  "living_dossier_requests",
];
const ttlRestoreCutoff = "2100-01-01T00:00:00.000Z";
const auth = [
  "--username",
  "amanor_test_admin",
  "--password",
  "amanor_test_admin_password",
  "--authenticationDatabase",
  "admin",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  return String(result.stdout ?? "").trim();
}

function mongoScript(database, script) {
  return run("docker", [
    "exec",
    container,
    "mongosh",
    "--quiet",
    ...auth,
    database,
    "--eval",
    script,
  ]);
}

// This verifier drives the same compose project, container and host port as
// the browser suite, and the `down` below is what makes its own run
// deterministic. Without the shared lock that teardown also destroys any
// browser suite already in flight, which then fails with connection refusals
// that look nothing like their real cause.
acquireFixtureLock("the MongoDB backup and restore verifier");

const startedAt = Date.now();
run("docker", [...compose, "down"], { stdio: "ignore" });
try {
  run("docker", [...compose, "up", "-d", "--wait"], { stdio: "inherit" });
  mongoScript(
    sourceDatabase,
    `db.records.drop(); db.audit.drop();
     db.records.createIndex({reference:1},{name:"reference_unique",unique:true});
     db.records.createIndex({expiresAt:1},{name:"expiry_ttl",expireAfterSeconds:0});
     db.audit.createIndex({eventHash:1},{name:"event_hash_unique",unique:true});
     db.records.insertMany([
       {reference:"DR-0001",kind:"content",expiresAt:new Date("2099-01-01T00:00:00Z")},
       {reference:"DR-0002",kind:"protocol",expiresAt:new Date("2099-01-02T00:00:00Z")}
     ]);
     db.audit.insertOne({eventId:"event-1",eventHash:"${"a".repeat(64)}",sequence:1});
     const ttlCollections=${JSON.stringify(ttlCollections)};
     for (const collectionName of ttlCollections) {
       const collection=db.getCollection(collectionName);
       collection.drop();
       collection.createIndex({expiresAt:1},{name:"expires_at_ttl",expireAfterSeconds:0});
       collection.insertMany([
         {reference:collectionName+"-expired",email:"expired-"+collectionName+"@restore.invalid",message:"stale personal payload",expiresAt:new Date("2099-01-01T00:00:00Z")},
         {reference:collectionName+"-current",email:"current-"+collectionName+"@restore.invalid",message:"unexpired synthetic payload",expiresAt:new Date("2101-01-01T00:00:00Z")}
       ]);
     }`,
  );
  mongoScript(
    roomSourceDatabase,
    `db.room_enquiries.drop(); db.room_events.drop();
     db.room_enquiries.createIndex({reference:1},{name:"room_reference_unique",unique:true});
     db.room_events.createIndex({occurredAt:1},{name:"room_event_time"});
     db.room_enquiries.insertOne({
       reference:"RM-RESTORE-0001",
       envelopeId:"${"e".repeat(32)}",
       envelope:{algorithm:"ECDH-P256-HKDF-SHA256-AES-256-GCM",ciphertext:"${"c".repeat(96)}"},
       ciphertextDigest:"${"d".repeat(64)}",
       ciphertextBytes:96,
       locale:"en-GB",
       recipientKeyId:"room-key-2026-01",
       keyEpoch:1,
       state:"received",
       receivedAt:new Date("2026-01-01T00:00:00Z"),
       deleteAfter:new Date("2026-06-30T00:00:00Z"),
       extensionCount:0,
       deletion:{status:"pending",attempts:0}
     });
     db.room_events.insertOne({
       action:"room_enquiry_received",reference:"RM-RESTORE-0001",keyId:"room-key-2026-01",
       actorId:null,reasonCategory:null,occurredAt:new Date("2026-01-01T00:00:00Z")
     });`,
  );

  // Capture an intentionally stale Room recovery point while ciphertext still
  // exists. Current content-free deletion evidence is archived separately, as
  // it must be in production, so restoring the old snapshot cannot resurrect
  // data that was deleted after that snapshot.
  run("docker", [
    "exec",
    container,
    "mongodump",
    ...auth,
    "--db",
    roomSourceDatabase,
    "--archive=" + roomArchive,
    "--gzip",
  ]);
  mongoScript(
    roomSourceDatabase,
    `db.room_enquiries.updateOne(
       {reference:"RM-RESTORE-0001"},
       {$set:{state:"actioned",deletion:{status:"done",attempts:0,deletedAt:new Date("2026-07-01T00:00:00Z")}},
        $unset:{envelope:"",ciphertextDigest:"",ciphertextBytes:"",locale:"",recipientKeyId:"",keyEpoch:"",envelopeId:""}}
     );
     db.room_events.insertOne({
       action:"room_enquiry_deleted",reference:"RM-RESTORE-0001",keyId:"room-key-2026-01",
       actorId:null,reasonCategory:null,occurredAt:new Date("2026-07-01T00:00:00Z")
     });`,
  );
  run("docker", [
    "exec",
    container,
    "mongodump",
    ...auth,
    "--db",
    roomSourceDatabase,
    "--collection",
    "room_events",
    "--archive=" + roomDeletionEvidenceArchive,
    "--gzip",
  ]);

  const backupStartedAt = Date.now();
  run("docker", [
    "exec",
    container,
    "mongodump",
    ...auth,
    "--db",
    sourceDatabase,
    "--archive=" + archive,
    "--gzip",
  ]);
  const backupMs = Date.now() - backupStartedAt;

  const restoreStartedAt = Date.now();
  run("docker", [
    "exec",
    container,
    "mongorestore",
    ...auth,
    "--archive=" + archive,
    "--gzip",
    "--drop",
    `--nsFrom=${sourceDatabase}.*`,
    `--nsTo=${restoredDatabase}.*`,
  ]);
  // TTL deletion is asynchronous and an old recovery point can contain records
  // that expired after the backup was taken. Reconcile those deadlines before
  // the restored application namespace is made available.
  mongoScript(
    restoredDatabase,
    `const cutoff=new Date("${ttlRestoreCutoff}");
     const ttlCollections=${JSON.stringify(ttlCollections)};
     for (const collectionName of ttlCollections) {
       db.getCollection(collectionName).deleteMany({expiresAt:{$lte:cutoff}});
     }`,
  );
  const restoreMs = Date.now() - restoreStartedAt;

  run("docker", [
    "exec",
    container,
    "mongorestore",
    ...auth,
    "--archive=" + roomArchive,
    "--gzip",
    "--drop",
    `--nsFrom=${roomSourceDatabase}.*`,
    `--nsTo=${roomRestoredDatabase}.*`,
  ]);
  run("docker", [
    "exec",
    container,
    "mongorestore",
    ...auth,
    "--archive=" + roomDeletionEvidenceArchive,
    "--gzip",
    `--nsFrom=${roomSourceDatabase}.room_events`,
    `--nsTo=${roomRestoredDatabase}.room_restore_evidence`,
  ]);
  mongoScript(
    roomRestoredDatabase,
    `const deletions=db.room_restore_evidence.find({action:"room_enquiry_deleted"}).toArray();
     for (const event of deletions) {
       db.room_enquiries.updateOne(
         {reference:event.reference},
         {$set:{state:"actioned",deletion:{status:"done",attempts:0,deletedAt:event.occurredAt}},
          $unset:{envelope:"",ciphertextDigest:"",ciphertextBytes:"",locale:"",recipientKeyId:"",keyEpoch:"",envelopeId:""}}
       );
     }`,
  );

  const verification = mongoScript(
    restoredDatabase,
    `const records=db.records.find({},{_id:0}).sort({reference:1}).toArray();
     const audit=db.audit.findOne({eventId:"event-1"},{_id:0});
     const recordIndexes=db.records.getIndexes();
     const auditIndexes=db.audit.getIndexes();
     const valid=records.length===2 && records[0].reference==="DR-0001" &&
       records[1].reference==="DR-0002" && audit.eventHash==="${"a".repeat(64)}" &&
       recordIndexes.some(i=>i.name==="reference_unique" && i.unique===true) &&
       recordIndexes.some(i=>i.name==="expiry_ttl" && i.expireAfterSeconds===0) &&
       auditIndexes.some(i=>i.name==="event_hash_unique" && i.unique===true);
     print(JSON.stringify({valid,recordCount:records.length,auditCount:db.audit.countDocuments({}),recordIndexes:recordIndexes.map(i=>i.name),auditIndexes:auditIndexes.map(i=>i.name)}));`,
  );
  const evidence = JSON.parse(verification.split("\n").at(-1));
  if (!evidence.valid)
    throw new Error(`Restored evidence is invalid: ${verification}`);
  const roomVerification = mongoScript(
    roomRestoredDatabase,
    `const item=db.room_enquiries.findOne({reference:"RM-RESTORE-0001"});
     const confidential=["envelope","ciphertextDigest","ciphertextBytes","locale","recipientKeyId","keyEpoch","envelopeId"];
     const restoredIndexes=db.room_enquiries.getIndexes();
     const deletionEvidence=db.room_restore_evidence.find({action:"room_enquiry_deleted"}).toArray();
     const valid=item && item.deletion.status==="done" && item.deletion.deletedAt.toISOString()==="2026-07-01T00:00:00.000Z" &&
       confidential.every(field=>!(field in item)) && deletionEvidence.length===1 &&
       deletionEvidence.every(event=>!("envelope" in event) && !("ciphertext" in event)) &&
       restoredIndexes.some(index=>index.name==="room_reference_unique" && index.unique===true);
     print(JSON.stringify({valid,reconciled:valid?1:0,deletionEvidence:deletionEvidence.length,indexes:restoredIndexes.map(index=>index.name)}));`,
  );
  const roomEvidence = JSON.parse(roomVerification.split("\n").at(-1));
  if (!roomEvidence.valid)
    throw new Error(
      `Room restore reconciliation is invalid: ${roomVerification}`,
    );
  const ttlVerification = mongoScript(
    restoredDatabase,
    `const ttlCollections=${JSON.stringify(ttlCollections)};
     const results=ttlCollections.map(collectionName=>{
       const collection=db.getCollection(collectionName);
       const records=collection.find({},{_id:0}).toArray();
       const indexes=collection.getIndexes();
       return {
         collectionName,
         valid:records.length===1 && records[0].reference===collectionName+"-current" &&
           records[0].expiresAt.toISOString()==="2101-01-01T00:00:00.000Z" &&
           !records.some(record=>JSON.stringify(record).includes("expired-"+collectionName+"@restore.invalid")) &&
           indexes.some(index=>index.key.expiresAt===1 && index.expireAfterSeconds===0),
         remaining:records.length
       };
     });
     print(JSON.stringify({valid:results.every(result=>result.valid),results}));`,
  );
  const ttlEvidence = JSON.parse(ttlVerification.split("\n").at(-1));
  if (!ttlEvidence.valid)
    throw new Error(
      `TTL restore reconciliation is invalid: ${ttlVerification}`,
    );
  process.stdout.write(
    `Mongo backup/restore passed: backup=${backupMs}ms restore=${restoreMs}ms total=${Date.now() - startedAt}ms records=${evidence.recordCount} audit=${evidence.auditCount} indexes=${[...evidence.recordIndexes, ...evidence.auditIndexes].join(",")} roomReconciled=${roomEvidence.reconciled} roomDeletionEvidence=${roomEvidence.deletionEvidence} ttlCollectionsReconciled=${ttlEvidence.results.length} ttlExpiredRemoved=${ttlEvidence.results.length}\n`,
  );
} finally {
  run("docker", [...compose, "down"], { stdio: "inherit" });
  releaseFixtureLock();
}
