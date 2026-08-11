import { describe, expect, it, vi } from "vitest";
import { RoomRepository } from "./room.repository";

describe("RoomRepository", () => {
  it("opens only an explicitly allowlisted Room collection", () => {
    const collection = vi.fn().mockReturnValue({ name: "room_enquiries" });
    const repository = new RoomRepository({ db: { collection } } as never);

    expect(repository.collection("room_enquiries")).toEqual({
      name: "room_enquiries",
    });
    expect(collection).toHaveBeenCalledWith("room_enquiries");
  });

  it("rejects a runtime attempt to address a general application collection", () => {
    const repository = new RoomRepository({
      db: { collection: vi.fn() },
    } as never);

    expect(() => repository.collection("users" as "room_enquiries")).toThrow(
      "Room repository collection is not allowed",
    );
  });

  it("fails closed before a Room connection is available", () => {
    const repository = new RoomRepository({ db: undefined } as never);
    expect(() => repository.collection("room_events")).toThrow(
      "Room database is unavailable",
    );
  });
});
