import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { NfcCard } from "@/models/NfcCard";
import * as schema from "@/schema";

export class NfcCardRepository {
	constructor(private readonly db: Database) {}

	async create(name: string, idm: string, userId: number): Promise<NfcCard> {
		const result = await this.db
			.insert(schema.nfcCards)
			.values({
				name,
				idm,
				userId,
			})
			.returning()
			.get();

		return new NfcCard(result.id, result.name, result.idm, result.userId);
	}

	async save(nfcCard: NfcCard): Promise<void> {
		await this.db
			.update(schema.nfcCards)
			.set({
				name: nfcCard.name,
				idm: nfcCard.idm,
				userId: nfcCard.userId,
			})
			.where(eq(schema.studentCards.id, nfcCard.id))
			.execute();
	}

	async findByIdm(idm: string): Promise<NfcCard | null> {
		const result = await this.db.query.nfcCards.findFirst({
			where: (nfcCards, { eq }) => eq(nfcCards.idm, idm),
		});

		if (!result) {
			return null;
		}

		return new NfcCard(result.id, result.name, result.idm, result.userId);
	}
}
