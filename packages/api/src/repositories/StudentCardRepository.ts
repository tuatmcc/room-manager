import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import { StudentCard } from "@/models/StudentCard";
import * as schema from "@/schema";

export interface StudentCardRepository {
	create(studentId: number, userId: number): Promise<StudentCard>;
	save(studentCard: StudentCard): Promise<void>;
	findByStudentId(studentId: number): Promise<StudentCard | null>;
	findByUserId(userId: number): Promise<StudentCard | null>;
}

export class DBStudentCardRepository implements StudentCardRepository {
	constructor(
		private readonly db: Database,
		private readonly logger: AppLogger = noopLogger,
	) {}

	async create(studentId: number, userId: number): Promise<StudentCard> {
		try {
			const result = await this.db
				.insert(schema.studentCards)
				.values({
					studentId,
					userId,
				})
				.returning()
				.get();

			this.logger.info("created student card", {
				studentId,
				userId,
			});

			return new StudentCard(result.id, result.studentId, result.userId);
		} catch (error) {
			this.logger.error("failed to create student card", {
				studentId,
				userId,
				...serializeError(error),
			});
			throw error;
		}
	}

	async save(studentCard: StudentCard): Promise<void> {
		try {
			await this.db
				.update(schema.studentCards)
				.set({
					studentId: studentCard.studentId,
					userId: studentCard.userId,
				})
				.where(eq(schema.studentCards.id, studentCard.id))
				.returning()
				.get();

			this.logger.info("saved student card", {
				cardId: studentCard.id,
				studentId: studentCard.studentId,
				userId: studentCard.userId,
			});
		} catch (error) {
			this.logger.error("failed to save student card", {
				cardId: studentCard.id,
				studentId: studentCard.studentId,
				userId: studentCard.userId,
				...serializeError(error),
			});
			throw error;
		}
	}

	async findByStudentId(studentId: number): Promise<StudentCard | null> {
		const result = await this.db.query.studentCards.findFirst({
			where: (studentCards, { eq }) => eq(studentCards.studentId, studentId),
		});
		if (!result) return null;

		return new StudentCard(result.id, result.studentId, result.userId);
	}

	async findByUserId(userId: number): Promise<StudentCard | null> {
		const result = await this.db.query.studentCards.findFirst({
			where: (studentCards, { eq }) => eq(studentCards.userId, userId),
		});
		if (!result) return null;

		return new StudentCard(result.id, result.studentId, result.userId);
	}
}
