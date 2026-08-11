export const ROOM_CONNECTION = "room";

export const ROOM_COLLECTIONS = [
  "room_enquiries",
  "room_events",
  "room_key_manifests",
] as const;

export type RoomCollectionName = (typeof ROOM_COLLECTIONS)[number];

export function isRoomCollection(value: string): value is RoomCollectionName {
  return (ROOM_COLLECTIONS as readonly string[]).includes(value);
}
