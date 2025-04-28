import { Temporal } from "@js-temporal/polyfill";
import { eq, inArray } from "drizzle-orm";

import type { Database } from "@/database";
import { RoomEntryLog } from "@/models/RoomEntryLog";
import { User } from "@/models/User";
import * as schema from "@/schema";
import { tracer } from "@/trace";

export class RoomEntryLogRepository {
	constructor(private readonly db: Database) {}

	async create(
		userId: number,
		entryAt: Temporal.Instant,
	): Promise<RoomEntryLog> {
		return await tracer.startActiveSpan(
			"room_manager.repository.room_entry_log.create",
			{
				attributes: {
					[RoomEntryLog.ATTRIBUTES.USER_ID]: userId,
					[RoomEntryLog.ATTRIBUTES.ENTRY_AT]: entryAt.toJSON(),
				},
			},
			async (span) => {
				try {
					const result = await this.db
						.insert(schema.roomEntryLogs)
						.values({
							userId,
							entryAt: entryAt.epochMilliseconds,
						})
						.returning()
						.get();

					const newRoomEntryLog = new RoomEntryLog(
						result.id,
						result.userId,
						Temporal.Instant.fromEpochMilliseconds(result.entryAt),
						null,
					);
					newRoomEntryLog.setAttributes();
					return newRoomEntryLog;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async save(roomEntryLog: RoomEntryLog): Promise<void> {
		await tracer.startActiveSpan(
			"room_manager.repository.room_entry_log.save",
			async (span) => {
				try {
					const result = await this.db
						.update(schema.roomEntryLogs)
						.set({
							userId: roomEntryLog.userId,
							entryAt: roomEntryLog.entryAt.epochMilliseconds,
							exitAt: roomEntryLog.exitAt?.epochMilliseconds,
						})
						.where(eq(schema.roomEntryLogs.id, roomEntryLog.id))
						.returning()
						.get();

					const updatedRoomEntryLog = new RoomEntryLog(
						result.id,
						result.userId,
						Temporal.Instant.fromEpochMilliseconds(result.entryAt),
						result.exitAt
							? Temporal.Instant.fromEpochMilliseconds(result.exitAt)
							: null,
					);
					updatedRoomEntryLog.setAttributes();
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findLastEntryByUserId(userId: number): Promise<RoomEntryLog | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.room_entry_log.find_last_entry_by_user_id",
			{
				attributes: {
					[User.ATTRIBUTES.ID]: userId,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.roomEntryLogs.findFirst({
						where: (roomEntryLogs, { and, eq, isNull }) =>
							and(
								eq(roomEntryLogs.userId, userId),
								isNull(roomEntryLogs.exitAt),
							),
						orderBy: (roomEntryLogs, { desc }) => desc(roomEntryLogs.entryAt),
					});
					if (!result) return null;

					const roomEntryLog = new RoomEntryLog(
						result.id,
						result.userId,
						Temporal.Instant.fromEpochMilliseconds(result.entryAt),
						null,
					);
					roomEntryLog.setAttributes();
					return roomEntryLog;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findAllEntry(): Promise<RoomEntryLog[]> {
		return await tracer.startActiveSpan(
			"room_manager.repository.room_entry_log.find_all_entry",
			async (span) => {
				try {
					const results = await this.db.query.roomEntryLogs.findMany({
						where: (roomEntryLogs, { isNull }) => isNull(roomEntryLogs.exitAt),
					});

					const roomEntryLogs = results.map(
						(result) =>
							new RoomEntryLog(
								result.id,
								result.userId,
								Temporal.Instant.fromEpochMilliseconds(result.entryAt),
								null,
							),
					);
					span.setAttribute(
						"room_manager.room_entry_log.count",
						roomEntryLogs.length,
					);
					return roomEntryLogs;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async setManyExitAt(
		entryLogIds: number[],
		exitAt: Temporal.Instant,
	): Promise<void> {
		await tracer.startActiveSpan(
			"room_manager.repository.room_entry_log.set_many_exit_at",
			async (span) => {
				try {
					await this.db
						.update(schema.roomEntryLogs)
						.set({
							exitAt: exitAt.epochMilliseconds,
						})
						.where(inArray(schema.roomEntryLogs.id, entryLogIds))
						.execute();
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}
}
