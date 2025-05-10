import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import * as schema from "@/schema";
import { tracer } from "@/trace";

export interface UnknownNfcCardRepository {
	create(idm: string): Promise<UnknownNfcCard>;
	findByCode(code: string): Promise<UnknownNfcCard | null>;
	findByIdm(idm: string): Promise<UnknownNfcCard | null>;
	deleteById(id: number): Promise<void>;
}

export class DBUnknownNfcCardRepository implements UnknownNfcCardRepository {
	constructor(private readonly db: Database) {}

	async create(idm: string): Promise<UnknownNfcCard> {
		return await tracer.startActiveSpan(
			"room_manager.repository.unknown_nfc_card.create",
			{
				attributes: {
					[UnknownNfcCard.ATTRIBUTES.IDM]: idm,
				},
			},
			async (span) => {
				try {
					let code: string;
					while (true) {
						code = Math.floor(Math.random() * 10_000)
							.toString(10)
							.padStart(4, "0");
						const existingCard = await this.db.query.unknownNfcCards.findFirst({
							where: (unknownNfcCards, { eq }) =>
								eq(unknownNfcCards.code, code),
						});
						if (!existingCard) break;
					}

					const result = await this.db
						.insert(schema.unknownNfcCards)
						.values({
							code,
							idm,
						})
						.returning()
						.get();

					const unknownNfcCard = new UnknownNfcCard(
						result.id,
						result.code,
						result.idm,
					);
					unknownNfcCard.setAttributes();
					return unknownNfcCard;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByCode(code: string): Promise<UnknownNfcCard | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.unknown_nfc_card.find_by_code",
			{
				attributes: {
					[UnknownNfcCard.ATTRIBUTES.CODE]: code,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.unknownNfcCards.findFirst({
						where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.code, code),
					});
					if (!result) return null;

					const unknownNfcCard = new UnknownNfcCard(
						result.id,
						result.code,
						result.idm,
					);
					unknownNfcCard.setAttributes();
					return unknownNfcCard;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async findByIdm(idm: string): Promise<UnknownNfcCard | null> {
		return await tracer.startActiveSpan(
			"room_manager.repository.unknown_nfc_card.find_by_idm",
			{
				attributes: {
					[UnknownNfcCard.ATTRIBUTES.IDM]: idm,
				},
			},
			async (span) => {
				try {
					const result = await this.db.query.unknownNfcCards.findFirst({
						where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.idm, idm),
					});
					if (!result) return null;

					const unknownNfcCard = new UnknownNfcCard(
						result.id,
						result.code,
						result.idm,
					);
					unknownNfcCard.setAttributes();
					return unknownNfcCard;
				} catch (error) {
					if (error instanceof Error) span.recordException(error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	async deleteById(id: number): Promise<void> {
		await tracer.startActiveSpan(
			"room_manager.repository.unknown_nfc_card.delete_by_id",
			{
				attributes: {
					[UnknownNfcCard.ATTRIBUTES.ID]: id,
				},
			},
			async (span) => {
				try {
					const result = await this.db
						.delete(schema.unknownNfcCards)
						.where(eq(schema.unknownNfcCards.id, id))
						.returning()
						.get();
					if (!result) return;

					const deletedCard = new UnknownNfcCard(
						result.id,
						result.code,
						result.idm,
					);
					deletedCard.setAttributes();
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
