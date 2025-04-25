import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import * as schema from "@/schema";

export class UnknownNfcCardRepository {
	constructor(private readonly db: Database) {}

	async create(idm: string): Promise<UnknownNfcCard> {
		let code: string;
		while (true) {
			code = Math.floor(Math.random() * 10_000)
				.toString(10)
				.padStart(4, "0");
			const existingCard = await this.db.query.unknownNfcCards.findFirst({
				where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.code, code),
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

		return new UnknownNfcCard(result.id, result.code, result.idm);
	}

	async findByCode(code: string): Promise<UnknownNfcCard | null> {
		const result = await this.db.query.unknownNfcCards.findFirst({
			where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.code, code),
		});

		if (!result) {
			return null;
		}

		return new UnknownNfcCard(result.id, result.code, result.idm);
	}

	async findByIdm(idm: string): Promise<UnknownNfcCard | null> {
		const result = await this.db.query.unknownNfcCards.findFirst({
			where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.idm, idm),
		});

		if (!result) {
			return null;
		}

		return new UnknownNfcCard(result.id, result.code, result.idm);
	}

	async deleteById(id: number): Promise<void> {
		await this.db
			.delete(schema.unknownNfcCards)
			.where(eq(schema.unknownNfcCards.id, id))
			.execute();
	}
}
