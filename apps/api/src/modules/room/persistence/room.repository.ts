import type { Connection } from "mongoose";
import {
  isRoomCollection,
  type RoomCollectionName,
} from "./room-database.constants";

type RoomCollection = ReturnType<NonNullable<Connection["db"]>["collection"]>;

/**
 * The only application-level entry point to Room collections. The named Room
 * connection supplies the infrastructure boundary; this allowlist prevents a
 * future Room service from using that credential as a general database client.
 */
export class RoomRepository {
  constructor(private readonly connection: Connection) {}

  collection(name: RoomCollectionName): RoomCollection {
    if (!isRoomCollection(name)) {
      throw new Error("Room repository collection is not allowed");
    }
    if (!this.connection.db) {
      throw new Error("Room database is unavailable");
    }
    return this.connection.db.collection(name);
  }
}
