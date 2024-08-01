import { ulid } from "ulidx";

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
