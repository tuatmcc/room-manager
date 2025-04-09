import { Temporal } from "@js-temporal/polyfill";

import type { Database } from "@/database";
import { RoomEntryLog } from "@/models/RoomEntryLog";
import * as schema from "@/schema";

export class RoomEntryLogRepository {
	constructor(private readonly db: Database) {}

	async create(
		userId: number,
		entryAt: Temporal.Instant,
	): Promise<RoomEntryLog> {
		const result = await this.db
			.insert(schema.roomEntryLogs)
			.values({
				userId,
				entryAt: entryAt.epochMilliseconds,
			})
			.returning()
			.get();

		return new RoomEntryLog(
			result.id,
			result.userId,
			Temporal.Instant.fromEpochMilliseconds(result.entryAt),
			null,
		);
	}

	async save(roomEntryLog: RoomEntryLog): Promise<void> {
		await this.db
			.update(schema.roomEntryLogs)
			.set({
				userId: roomEntryLog.userId,
				entryAt: roomEntryLog.entryAt.epochMilliseconds,
				exitAt: roomEntryLog.exitAt?.epochMilliseconds,
			})
			.execute();
	}

	async findLastEntryByUserId(userId: number): Promise<RoomEntryLog | null> {
		const result = await this.db.query.roomEntryLogs.findFirst({
			where: (roomEntryLogs, { and, eq, isNull }) =>
				and(eq(roomEntryLogs.userId, userId), isNull(roomEntryLogs.exitAt)),
			orderBy: (roomEntryLogs, { desc }) => desc(roomEntryLogs.entryAt),
		});

		if (!result) {
			return null;
		}

		return new RoomEntryLog(
			result.id,
			result.userId,
			Temporal.Instant.fromEpochMilliseconds(result.entryAt),
			null,
		);
	}
}
