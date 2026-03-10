import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
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
	constructor(
		private readonly db: Database,
		private readonly logger: AppLogger = noopLogger,
	) {}

	async create(idm: string): Promise<UnknownNfcCard> {
		const existing = await this.findByIdm(idm);
		if (existing) {
			this.logger.info("reused unknown nfc card", {
				code: existing.code,
				idm,
				unknownNfcCardId: existing.id,
			});
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

				this.logger.info("created unknown nfc card", {
					attempt: attempt + 1,
					code,
					idm,
					unknownNfcCardId: result.id,
				});
				return new UnknownNfcCard(result.id, result.code, result.idm);
			} catch (error) {
				if (!isUniqueConstraintError(error)) {
					this.logger.error("failed to create unknown nfc card", {
						attempt: attempt + 1,
						code,
						idm,
						...serializeError(error),
					});
					throw error;
				}

				if (hasUniqueConstraint(error, "unknown_nfc_cards.idm")) {
					const existing = await this.findByIdm(idm);
					if (existing) {
						this.logger.info("reused unknown nfc card after idm conflict", {
							attempt: attempt + 1,
							code: existing.code,
							idm,
							unknownNfcCardId: existing.id,
						});
						return existing;
					}
				}

				if (hasUniqueConstraint(error, "unknown_nfc_cards.code")) {
					this.logger.warn("retrying unknown nfc code allocation", {
						attempt: attempt + 1,
						code,
						idm,
					});
					continue;
				}

				this.logger.error("failed to create unknown nfc card", {
					attempt: attempt + 1,
					code,
					idm,
					...serializeError(error),
				});
				throw error;
			}
		}

		this.logger.error("exhausted unknown nfc code allocation retries", { idm });
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
		try {
			await this.db
				.delete(schema.unknownNfcCards)
				.where(eq(schema.unknownNfcCards.id, id))
				.returning()
				.get();
			this.logger.info("deleted unknown nfc card", { unknownNfcCardId: id });
		} catch (error) {
			this.logger.error("failed to delete unknown nfc card", {
				unknownNfcCardId: id,
				...serializeError(error),
			});
			throw error;
		}
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
