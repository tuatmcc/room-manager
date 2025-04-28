import { trace } from "@opentelemetry/api";

export class StudentCard {
	static readonly ATTRIBUTES = {
		ID: "room_manager.student_card.id",
		STUDENT_ID: "room_manager.student_card.student_id",
		USER_ID: "room_manager.student_card.user_id",
	};

	constructor(
		public readonly id: number,
		public readonly studentId: number,
		public readonly userId: number,
	) {}

	updateStudentId(studentId: number): StudentCard {
		return new StudentCard(this.id, studentId, this.userId);
	}

	setAttributes(): void {
		trace.getActiveSpan()?.setAttributes({
			[StudentCard.ATTRIBUTES.ID]: this.id,
			[StudentCard.ATTRIBUTES.STUDENT_ID]: this.studentId,
			[StudentCard.ATTRIBUTES.USER_ID]: this.userId,
		});
	}
}
