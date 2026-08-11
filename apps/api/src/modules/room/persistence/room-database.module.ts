import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ROOM_CONNECTION } from "./room-database.constants";

@Module({
  imports: [
    MongooseModule.forRootAsync({
      connectionName: ROOM_CONNECTION,
      inject: [ConfigService],
      useFactory: (configuration: ConfigService) => ({
        uri: configuration.getOrThrow<string>("ROOM_MONGODB_URI"),
        autoIndex: false,
        maxPoolSize: 5,
        minPoolSize:
          configuration.get<string>("NODE_ENV") === "production" ? 1 : 0,
        serverSelectionTimeoutMS: 5_000,
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class RoomDatabaseModule {}
