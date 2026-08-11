import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { migrations } from "./migrations/registry";
import { runMigrations } from "./migrations/runner";

@Injectable()
export class MigrationService implements OnApplicationBootstrap {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.configuration.get<string>("RUN_MIGRATIONS") !== "true") return;
    if (!this.connection.db)
      throw new Error("MongoDB database is unavailable during migration");
    await runMigrations(this.connection.db, migrations);
  }
}
