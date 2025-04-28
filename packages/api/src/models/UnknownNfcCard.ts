import { trace } from "@opentelemetry/api";

export class UnknownNfcCard {
	static readonly ATTRIBUTES = {
		ID: "room_manager.unknown_nfc_card.id",
		CODE: "room_manager.unknown_nfc_card.code",
		IDM: "room_manager.unknown_nfc_card.idm",
	};

	constructor(
		public readonly id: number,
		public readonly code: string,
		public readonly idm: string,
	) {}

	setAttributes(): void {
		trace.getActiveSpan()?.setAttributes({
			[UnknownNfcCard.ATTRIBUTES.ID]: this.id,
			[UnknownNfcCard.ATTRIBUTES.CODE]: this.code,
			[UnknownNfcCard.ATTRIBUTES.IDM]: this.idm,
		});
	}
}
