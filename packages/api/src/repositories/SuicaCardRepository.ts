import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { SuicaCard } from "@/models/SuicaCard";
import * as schema from "@/schema";

export class SuicaCardRepository {
	constructor(private readonly db: Database) {}

	async create(suicaIdm: string, userId: number): Promise<SuicaCard> {
		const result = await this.db
			.insert(schema.suicaCards)
			.values({
				card_idm: suicaIdm,
				userId,
			})
			.returning()
			.get();

		return new SuicaCard(result.id, result.card_idm, result.userId);
	}

	async save(suicaCard: SuicaCard): Promise<void> {
		await this.db
			.update(schema.suicaCards)
			.set({
				card_idm: suicaCard.suicaIdm,
				userId: suicaCard.userId,
			})
			.where(eq(schema.studentCards.id, suicaCard.id))
			.execute();
	}

	async findBySuicaIdm(suicaIdm: string): Promise<SuicaCard | null> {
		const result = await this.db.query.suicaCards.findFirst({
			where: (suicaCards, { eq }) => eq(suicaCards.card_idm, suicaIdm),
		});

		if (!result) {
			return null;
		}

		return new SuicaCard(result.id, result.card_idm, result.userId);
	}
}
