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
}
