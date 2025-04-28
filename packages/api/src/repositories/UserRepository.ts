import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { NfcCard } from "@/models/NfcCard";
import { StudentCard } from "@/models/StudentCard";
import { User } from "@/models/User";
import * as schema from "@/schema";
import { tracer } from "@/trace";

export class UserRepository {
	constructor(private readonly db: Database) {}

	async create(discordId: string): Promise<User> {
		return await tracer.startActiveSpan(
			"room_manager.repository.user.create",
			{
				attributes: {
					[User.ATTRIBUTES.DISCORD_ID]: discordId,
				},
			},
			async (span) => {
				try {
					const result = await this.db
						.insert(schema.users)
						.values({
							discordId,
						})
						.returning()
						.get();

					const newUser = new User(result.id, result.discordId);
					newUser.setAttributes();
					return newUser;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async save(user: User): Promise<void> {
		await tracer.startActiveSpan(
			"room_manager.repository.user.save",
			async (span) => {
				try {
					const result = await this.db
						.update(schema.users)
						.set({
							discordId: user.discordId,
						})
						.where(eq(schema.users.id, user.id))
						.returning()
						.get();

					const updatedUser = new User(result.id, result.discordId);
					updatedUser.setAttributes();
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByIds(ids: number[]): Promise<User[]> {
		return await tracer.startActiveSpan(
			"room_manager.repository.user.find_by_ids",
			async (span) => {
				try {
					const result = await this.db.query.users.findMany({
						where: (users, { inArray }) => inArray(users.id, ids),
					});

					const users = result.map((user) => {
						const newUser = new User(user.id, user.discordId);
						newUser.setAttributes();
						return newUser;
					});
					return users;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByDiscordId(discordId: string): Promise<User | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.user.find_by_discord_id",
			{
				attributes: {
					[User.ATTRIBUTES.DISCORD_ID]: discordId,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.users.findFirst({
						where: (users, { eq }) => eq(users.discordId, discordId),
					});
					if (!result) return null;

					const user = new User(result.id, result.discordId);
					user.setAttributes();
					return user;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByStudentId(studentId: number): Promise<User | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.user.find_by_student_id",
			{
				attributes: {
					[StudentCard.ATTRIBUTES.STUDENT_ID]: studentId,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.studentCards.findFirst({
						where: (studentCards, { eq }) =>
							eq(studentCards.studentId, studentId),
						with: {
							user: true,
						},
					});
					if (!result) return null;

					const user = new User(result.user.id, result.user.discordId);
					user.setAttributes();
					return user;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByNfcIdm(idm: string): Promise<User | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.user.find_by_nfc_idm",
			{
				attributes: {
					[NfcCard.ATTRIBUTES.IDM]: idm,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.nfcCards.findFirst({
						where: (nfcCards, { eq }) => eq(nfcCards.idm, idm),
						with: {
							user: true,
						},
					});
					if (!result) return null;

					const user = new User(result.user.id, result.user.discordId);
					user.setAttributes();
					return user;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findAllEntryUsers(): Promise<User[]> {
		return await tracer.startActiveSpan(
			"room_manager.repository.user.find_all_entry_users",
			async (span) => {
				try {
					const result = await this.db.query.roomEntryLogs.findMany({
						where: (roomEntryLogs, { isNull }) => isNull(roomEntryLogs.exitAt),
						with: {
							user: true,
						},
					});

					const users = result.map((entryLog) => {
						const user = new User(entryLog.user.id, entryLog.user.discordId);
						user.setAttributes();
						return user;
					});
					return users;
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
