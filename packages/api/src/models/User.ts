import { trace } from "@opentelemetry/api";

export class User {
	static readonly ATTRIBUTES = {
		ID: "room_manager.user.id",
		DISCORD_ID: "room_manager.user.discord_id",
	};

	constructor(
		public readonly id: number,
		public readonly discordId: string,
	) {}

	setAttributes(): void {
		trace.getActiveSpan()?.setAttributes({
			[User.ATTRIBUTES.ID]: this.id,
			[User.ATTRIBUTES.DISCORD_ID]: this.discordId,
		});
	}
}
