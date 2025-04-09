import type { Temporal } from "@js-temporal/polyfill";

export class RoomEntryLog {
	exitRoom(exitAt: Temporal.Instant): RoomEntryLog {
		if (this.exitAt !== null) {
			throw new Error("Already exited");
		}

		return new RoomEntryLog(this.id, this.userId, this.entryAt, exitAt);
	}

	constructor(
		public readonly id: number,
		public readonly userId: number,
		public readonly entryAt: Temporal.Instant,
		public readonly exitAt: Temporal.Instant | null,
	) {}
}
