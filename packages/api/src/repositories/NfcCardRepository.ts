import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { NfcCard } from "@/models/NfcCard";
import * as schema from "@/schema";
import { tracer } from "@/trace";

export class NfcCardRepository {
	constructor(private readonly db: Database) {}

	async create(name: string, idm: string, userId: number): Promise<NfcCard> {
		return await tracer.startActiveSpan(
			"room_manager.repository.nfc_card.create",
			{
				attributes: {
					[NfcCard.ATTRIBUTES.NAME]: name,
					[NfcCard.ATTRIBUTES.IDM]: idm,
					[NfcCard.ATTRIBUTES.USER_ID]: userId,
				},
			},
			async (span) => {
				try {
					const result = await this.db
						.insert(schema.nfcCards)
						.values({
							name,
							idm,
							userId,
						})
						.returning()
						.get();

					const newNfcCard = new NfcCard(
						result.id,
						result.name,
						result.idm,
						result.userId,
					);
					newNfcCard.setAttributes();
					return newNfcCard;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async save(nfcCard: NfcCard): Promise<void> {
		await tracer.startActiveSpan(
			"room_manager.repository.nfc_card.save",
			async (span) => {
				try {
					const result = await this.db
						.update(schema.nfcCards)
						.set({
							name: nfcCard.name,
							idm: nfcCard.idm,
							userId: nfcCard.userId,
						})
						.where(eq(schema.studentCards.id, nfcCard.id))
						.returning()
						.get();

					const updatedNfcCard = new NfcCard(
						result.id,
						result.name,
						result.idm,
						result.userId,
					);
					updatedNfcCard.setAttributes();
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByIdm(idm: string): Promise<NfcCard | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.nfc_card.find_by_idm",
			{
				attributes: {
					[NfcCard.ATTRIBUTES.IDM]: idm,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.nfcCards.findFirst({
						where: (nfcCards, { eq }) => eq(nfcCards.idm, idm),
					});
					if (!result) return null;

					const nfcCard = new NfcCard(
						result.id,
						result.name,
						result.idm,
						result.userId,
					);
					nfcCard.setAttributes();
					return nfcCard;
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
