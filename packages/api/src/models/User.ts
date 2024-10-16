import { ulid } from "ulidx";
import { z } from "zod";

export class User {
	static new(discordId: string, studentId: string): User {
		return new User(ulid(), discordId, studentId, false);
	}
	static of(
		id: string,
		discordId: string,
		studentId: string,
		isInRoom: boolean,
	): User {
		return new User(id, discordId, studentId, isInRoom);
	}

	updateStudentId(studentId: string): User {
		return User.of(this.id, this.discordId, studentId, this.isInRoom);
	}

	withIsInRoom(isInRoom: boolean): User {
		return User.of(this.id, this.discordId, this.studentId, isInRoom);
	}

	private constructor(
		public readonly id: string,
		public readonly discordId: string,
		public readonly studentId: string,
		public readonly isInRoom: boolean,
	) {}
}

export const ActionSchema = z.enum(["entered", "exited"]);
export type Action = z.infer<typeof ActionSchema>;
