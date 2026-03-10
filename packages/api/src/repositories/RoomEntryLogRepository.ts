import { Temporal } from "@js-temporal/polyfill";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "@/database";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import { RoomEntryLog } from "@/models/RoomEntryLog";
import * as schema from "@/schema";

const TOGGLE_RETRY_LIMIT = 5;

export type RoomEntryToggleStatus = "entry" | "exit";

export interface RoomEntryLogRepository {
  toggle(userId: number, at: Temporal.Instant): Promise<RoomEntryToggleStatus>;
  findAllEntry(): Promise<RoomEntryLog[]>;
  setManyExitAt(entryLogIds: number[], exitAt: Temporal.Instant): Promise<void>;
}

export class DBRoomEntryLogRepository implements RoomEntryLogRepository {
  constructor(
    private readonly db: Database,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async toggle(userId: number, at: Temporal.Instant): Promise<RoomEntryToggleStatus> {
    for (let attempt = 0; attempt < TOGGLE_RETRY_LIMIT; attempt += 1) {
      const openEntryLog = await this.db.query.roomEntryLogs.findFirst({
        where: (roomEntryLogs, { and, eq, isNull }) =>
          and(eq(roomEntryLogs.userId, userId), isNull(roomEntryLogs.exitAt)),
        orderBy: (roomEntryLogs, { desc }) => desc(roomEntryLogs.entryAt),
      });

      if (openEntryLog) {
        const closedEntryLogs = await this.db
          .update(schema.roomEntryLogs)
          .set({
            exitAt: at.epochMilliseconds,
          })
          .where(
            and(
              eq(schema.roomEntryLogs.id, openEntryLog.id),
              eq(schema.roomEntryLogs.userId, userId),
              isNull(schema.roomEntryLogs.exitAt),
            ),
          )
          .returning()
          .all();

        if (closedEntryLogs.length > 0) {
          this.logger.info("closed entry log", {
            attempt: attempt + 1,
            entryLogId: openEntryLog.id,
            userId,
          });
          return "exit";
        }

        this.logger.warn("retrying room entry close after concurrent update", {
          attempt: attempt + 1,
          entryLogId: openEntryLog.id,
          userId,
        });
        continue;
      }

      try {
        await this.db
          .insert(schema.roomEntryLogs)
          .values({
            userId,
            entryAt: at.epochMilliseconds,
          })
          .returning()
          .get();

        this.logger.info("created entry log", {
          attempt: attempt + 1,
          userId,
        });
        return "entry";
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          this.logger.warn("retrying room entry toggle after unique constraint", {
            attempt: attempt + 1,
            userId,
          });
          continue;
        }

        this.logger.error("failed to toggle room entry state", {
          attempt: attempt + 1,
          userId,
          ...serializeError(error),
        });
        throw error;
      }
    }

    this.logger.error("exhausted room entry toggle retries", { userId });
    throw new Error(`Failed to toggle room entry state for user ${userId}.`);
  }

  async findAllEntry(): Promise<RoomEntryLog[]> {
    const results = await this.db.query.roomEntryLogs.findMany({
      where: (roomEntryLogs, { isNull }) => isNull(roomEntryLogs.exitAt),
    });

    return results.map(
      (result) =>
        new RoomEntryLog(
          result.id,
          result.userId,
          Temporal.Instant.fromEpochMilliseconds(result.entryAt),
          null,
        ),
    );
  }

  async setManyExitAt(entryLogIds: number[], exitAt: Temporal.Instant): Promise<void> {
    try {
      await this.db
        .update(schema.roomEntryLogs)
        .set({
          exitAt: exitAt.epochMilliseconds,
        })
        .where(inArray(schema.roomEntryLogs.id, entryLogIds))
        .execute();
      this.logger.info("updated exit timestamps", {
        entryLogCount: entryLogIds.length,
      });
    } catch (error) {
      this.logger.error("failed to update exit timestamps", {
        entryLogCount: entryLogIds.length,
        ...serializeError(error),
      });
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("UNIQUE constraint failed") ||
      error.message.includes("SQLITE_CONSTRAINT"))
  );
}
