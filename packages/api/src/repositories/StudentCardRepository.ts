import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { StudentCard } from "@/models/StudentCard";
import * as schema from "@/schema";

export class StudentCardRepository {
	constructor(private readonly db: Database) {}

	async create(studentId: number, userId: number): Promise<StudentCard> {
		const result = await this.db
			.insert(schema.studentCards)
			.values({
				studentId,
				userId,
			})
			.returning()
			.get();

		return new StudentCard(result.id, result.studentId, result.userId);
	}

	async save(studentCard: StudentCard): Promise<void> {
		await this.db
			.update(schema.studentCards)
			.set({
				studentId: studentCard.studentId,
				userId: studentCard.userId,
			})
			.where(eq(schema.studentCards.id, studentCard.id))
			.execute();
	}

	async findByStudentId(studentId: number): Promise<StudentCard | null> {
		const result = await this.db.query.studentCards.findFirst({
			where: (studentCards, { eq }) => eq(studentCards.studentId, studentId),
		});

		if (!result) {
			return null;
		}

		return new StudentCard(result.id, result.studentId, result.userId);
	}

	async findByUserId(userId: number): Promise<StudentCard | null> {
		const result = await this.db.query.studentCards.findFirst({
			where: (studentCards, { eq }) => eq(studentCards.userId, userId),
		});

		if (!result) {
			return null;
		}

		return new StudentCard(result.id, result.studentId, result.userId);
	}
}
