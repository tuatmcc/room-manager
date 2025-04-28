import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { StudentCard } from "@/models/StudentCard";
import * as schema from "@/schema";
import { tracer } from "@/trace";

export class StudentCardRepository {
	constructor(private readonly db: Database) {}

	async create(studentId: number, userId: number): Promise<StudentCard> {
		return await tracer.startActiveSpan(
			"room_manager.repository.student_card.create",
			{
				attributes: {
					[StudentCard.ATTRIBUTES.STUDENT_ID]: studentId,
					[StudentCard.ATTRIBUTES.USER_ID]: userId,
				},
			},
			async (span) => {
				try {
					const result = await this.db
						.insert(schema.studentCards)
						.values({
							studentId,
							userId,
						})
						.returning()
						.get();

					const newStudentCard = new StudentCard(
						result.id,
						result.studentId,
						result.userId,
					);
					newStudentCard.setAttributes();
					return newStudentCard;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async save(studentCard: StudentCard): Promise<void> {
		await tracer.startActiveSpan(
			"room_manager.repository.student_card.save",
			async (span) => {
				try {
					const result = await this.db
						.update(schema.studentCards)
						.set({
							studentId: studentCard.studentId,
							userId: studentCard.userId,
						})
						.where(eq(schema.studentCards.id, studentCard.id))
						.returning()
						.get();

					const updatedStudentCard = new StudentCard(
						result.id,
						result.studentId,
						result.userId,
					);
					updatedStudentCard.setAttributes();
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByStudentId(studentId: number): Promise<StudentCard | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.student_card.find_by_student_id",
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
					});
					if (!result) return null;

					const studentCard = new StudentCard(
						result.id,
						result.studentId,
						result.userId,
					);
					studentCard.setAttributes();
					return studentCard;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByUserId(userId: number): Promise<StudentCard | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.student_card.find_by_user_id",
			{
				attributes: {
					[StudentCard.ATTRIBUTES.USER_ID]: userId,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.studentCards.findFirst({
						where: (studentCards, { eq }) => eq(studentCards.userId, userId),
					});
					if (!result) return null;

					const studentCard = new StudentCard(
						result.id,
						result.studentId,
						result.userId,
					);
					studentCard.setAttributes();
					return studentCard;
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
