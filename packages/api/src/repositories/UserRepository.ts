import type { Database } from "@/database";
import { User } from "@/models/User";
import * as schema from "@/schema";

export class UserRepository {
	constructor(private readonly db: Database) {}

	async create(discordId: string): Promise<User> {
		const result = await this.db
			.insert(schema.users)
			.values({
				discordId,
			})
			.returning()
			.get();

		return new User(result.id, result.discordId);
	}

	async save(user: User): Promise<void> {
		await this.db
			.update(schema.users)
			.set({
				discordId: user.discordId,
			})
			.execute();
	}

	async findByIds(ids: number[]): Promise<User[]> {
		const result = await this.db.query.users.findMany({
			where: (users, { inArray }) => inArray(users.id, ids),
		});

		return result.map((user) => new User(user.id, user.discordId));
	}

	async findByDiscordId(discordId: string): Promise<User | null> {
		const result = await this.db.query.users.findFirst({
			where: (users, { eq }) => eq(users.discordId, discordId),
		});
		if (!result) {
			return null;
		}

		return new User(result.id, result.discordId);
	}

	async findByStudentId(studentId: number): Promise<User | null> {
		const result = await this.db.query.studentCards.findFirst({
			where: (studentCards, { eq }) => eq(studentCards.studentId, studentId),
			with: {
				user: true,
			},
		});

		if (!result) {
			return null;
		}

		return new User(result.user.id, result.user.discordId);
	}

	async findByNfcIdm(idm: string): Promise<User | null> {
		const result = await this.db.query.nfcCards.findFirst({
			where: (nfcCards, { eq }) => eq(nfcCards.idm, idm),
			with: {
				user: true,
			},
		});

		if (!result) {
			return null;
		}

		return new User(result.user.id, result.user.discordId);
	}

	async findAllEntryUsers(): Promise<User[]> {
		const result = await this.db.query.roomEntryLogs.findMany({
			where: (roomEntryLogs, { isNull }) => isNull(roomEntryLogs.exitAt),
			with: {
				user: true,
			},
		});

		const users = result.map(
			(entryLog) => new User(entryLog.user.id, entryLog.user.discordId),
		);

		return users;
	}
}
