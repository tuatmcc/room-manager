import type { DrizzleD1Database } from "drizzle-orm/d1";

import { User } from "@/models/User";
import * as schema from "@/schema";

export class UserRepository {
	constructor(private readonly db: DrizzleD1Database<typeof schema>) {}

	async save(user: User): Promise<void> {
		await this.db
			.insert(schema.users)
			.values({
				id: user.id,
				discordId: user.discordId,
				studentId: user.studentId,
				isInRoom: user.isInRoom,
			})
			.onConflictDoUpdate({
				target: schema.users.id,
				set: {
					discordId: user.discordId,
					studentId: user.studentId,
					isInRoom: user.isInRoom,
				},
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

		return User.of(
			result.id,
			result.discordId,
			result.studentId,
			result.isInRoom,
		);
	}

	async findByStudentId(studentId: string): Promise<User | null> {
		const result = await this.db.query.users.findFirst({
			where: (users, { eq }) => eq(users.studentId, studentId),
		});
		if (!result) {
			return null;
		}

		return User.of(
			result.id,
			result.discordId,
			result.studentId,
			result.isInRoom,
		);
	}
}
