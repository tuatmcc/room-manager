import { trace } from "@opentelemetry/api";

export class NfcCard {
	static readonly ATTRIBUTES = {
		ID: "room_manager.nfc_card.id",
		NAME: "room_manager.nfc_card.name",
		IDM: "room_manager.nfc_card.idm",
		USER_ID: "room_manager.nfc_card.user_id",
	};

	constructor(
		public readonly id: number,
		public readonly name: string,
		public readonly idm: string,
		public readonly userId: number,
	) {}

	setAttributes(): void {
		trace.getActiveSpan()?.setAttributes({
			[NfcCard.ATTRIBUTES.ID]: this.id,
			[NfcCard.ATTRIBUTES.NAME]: this.name,
			[NfcCard.ATTRIBUTES.IDM]: this.idm,
			[NfcCard.ATTRIBUTES.USER_ID]: this.userId,
		});
	}
}
