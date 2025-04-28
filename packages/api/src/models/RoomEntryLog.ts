import type { Temporal } from "@js-temporal/polyfill";
import { trace } from "@opentelemetry/api";

export class RoomEntryLog {
	static readonly ATTRIBUTES = {
		ID: "room_manager.room_entry_log.id",
		USER_ID: "room_manager.room_entry_log.user_id",
		ENTRY_AT: "room_manager.room_entry_log.entry_at",
		EXIT_AT: "room_manager.room_entry_log.exit_at",
	};

	constructor(
		public readonly id: number,
		public readonly userId: number,
		public readonly entryAt: Temporal.Instant,
		public readonly exitAt: Temporal.Instant | null,
	) {}

	exitRoom(exitAt: Temporal.Instant): RoomEntryLog {
		if (this.exitAt !== null) {
			throw new Error("Already exited");
		}

		return new RoomEntryLog(this.id, this.userId, this.entryAt, exitAt);
	}

	setAttributes(): void {
		trace.getActiveSpan()?.setAttributes({
			[RoomEntryLog.ATTRIBUTES.ID]: this.id,
			[RoomEntryLog.ATTRIBUTES.USER_ID]: this.userId,
			[RoomEntryLog.ATTRIBUTES.ENTRY_AT]: this.entryAt.toJSON(),
			[RoomEntryLog.ATTRIBUTES.EXIT_AT]: this.exitAt?.toJSON(),
		});
	}
}
