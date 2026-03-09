import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import * as schema from "@/schema";

const UNKNOWN_NFC_CODE_RETRY_LIMIT = 16;

export interface UnknownNfcCardRepository {
	create(idm: string): Promise<UnknownNfcCard>;
	findByCode(code: string): Promise<UnknownNfcCard | null>;
	findByIdm(idm: string): Promise<UnknownNfcCard | null>;
	deleteById(id: number): Promise<void>;
}

export class DBUnknownNfcCardRepository implements UnknownNfcCardRepository {
	constructor(private readonly db: Database) {}

	async create(idm: string): Promise<UnknownNfcCard> {
		const existing = await this.findByIdm(idm);
		if (existing) {
			return existing;
		}

		for (
			let attempt = 0;
			attempt < UNKNOWN_NFC_CODE_RETRY_LIMIT;
			attempt += 1
		) {
			const code = generateUnknownNfcCode();

			try {
				const result = await this.db
					.insert(schema.unknownNfcCards)
					.values({
						code,
						idm,
					})
					.returning()
					.get();

				return new UnknownNfcCard(result.id, result.code, result.idm);
			} catch (error) {
				if (!isUniqueConstraintError(error)) {
					throw error;
				}

				if (hasUniqueConstraint(error, "unknown_nfc_cards.idm")) {
					const existing = await this.findByIdm(idm);
					if (existing) {
						return existing;
					}
				}

				if (hasUniqueConstraint(error, "unknown_nfc_cards.code")) {
					continue;
				}

				throw error;
			}
		}

		throw new Error(`Failed to allocate unknown NFC code for IDm ${idm}.`);
	}

	async findByCode(code: string): Promise<UnknownNfcCard | null> {
		const result = await this.db.query.unknownNfcCards.findFirst({
			where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.code, code),
		});
		if (!result) return null;

		return new UnknownNfcCard(result.id, result.code, result.idm);
	}

	async findByIdm(idm: string): Promise<UnknownNfcCard | null> {
		const result = await this.db.query.unknownNfcCards.findFirst({
			where: (unknownNfcCards, { eq }) => eq(unknownNfcCards.idm, idm),
		});
		if (!result) return null;

		return new UnknownNfcCard(result.id, result.code, result.idm);
	}

	async deleteById(id: number): Promise<void> {
		await this.db
			.delete(schema.unknownNfcCards)
			.where(eq(schema.unknownNfcCards.id, id))
			.returning()
			.get();
	}
}

function generateUnknownNfcCode(): string {
	return Math.floor(Math.random() * 10_000)
		.toString(10)
		.padStart(4, "0");
}

function isUniqueConstraintError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.includes("UNIQUE constraint failed") ||
			error.message.includes("SQLITE_CONSTRAINT"))
	);
}

function hasUniqueConstraint(error: unknown, columnName: string): boolean {
	return error instanceof Error && error.message.includes(columnName);
}
