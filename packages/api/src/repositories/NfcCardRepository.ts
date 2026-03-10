import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import { NfcCard } from "@/models/NfcCard";
import * as schema from "@/schema";

export interface NfcCardRepository {
  create(name: string, idm: string, userId: number): Promise<NfcCard>;
  save(nfcCard: NfcCard): Promise<void>;
  findByIdm(idm: string): Promise<NfcCard | null>;
}

export class DBNfcCardRepository implements NfcCardRepository {
  constructor(
    private readonly db: Database,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async create(name: string, idm: string, userId: number): Promise<NfcCard> {
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

      this.logger.info("created nfc card", {
        idm,
        name,
        userId,
      });

      return new NfcCard(result.id, result.name, result.idm, result.userId);
    } catch (error) {
      this.logger.error("failed to create nfc card", {
        idm,
        name,
        userId,
        ...serializeError(error),
      });
      throw error;
    }
  }

  async save(nfcCard: NfcCard): Promise<void> {
    try {
      await this.db
        .update(schema.nfcCards)
        .set({
          name: nfcCard.name,
          idm: nfcCard.idm,
          userId: nfcCard.userId,
        })
        .where(eq(schema.nfcCards.id, nfcCard.id))
        .returning()
        .get();

      this.logger.info("saved nfc card", {
        cardId: nfcCard.id,
        idm: nfcCard.idm,
        name: nfcCard.name,
        userId: nfcCard.userId,
      });
    } catch (error) {
      this.logger.error("failed to save nfc card", {
        cardId: nfcCard.id,
        idm: nfcCard.idm,
        name: nfcCard.name,
        userId: nfcCard.userId,
        ...serializeError(error),
      });
      throw error;
    }
  }

  async findByIdm(idm: string): Promise<NfcCard | null> {
    const result = await this.db.query.nfcCards.findFirst({
      where: (nfcCards, { eq }) => eq(nfcCards.idm, idm),
    });
    if (!result) return null;

    return new NfcCard(result.id, result.name, result.idm, result.userId);
  }
}
