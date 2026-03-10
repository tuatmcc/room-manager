import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { NfcCardRepository } from "@/repositories/NfcCardRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export class RegisterNfcCardUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly nfcCardRepository: NfcCardRepository,
    private readonly unknownNfcCardRepository: UnknownNfcCardRepository,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async execute(
    discordId: string,
    code: string,
    name: string,
  ): Promise<Result<void, RegisterNfcCardError>> {
    this.logger.info("register nfc card started", {
      code,
      discordId,
      name,
    });
    try {
      const user =
        (await this.userRepository.findByDiscordId(discordId)) ??
        (await this.userRepository.create(discordId));

      const unknownNfcCard = await this.unknownNfcCardRepository.findByCode(code);
      if (!unknownNfcCard) {
        this.logger.info("unknown nfc card code not found", {
          code,
          discordId,
          name,
        });
        return err(
          new RegisterNfcCardError("Unknown NFC card.", {
            meta: {
              code: "NFC_CARD_NOT_FOUND",
            },
          }),
        );
      }

      if (await this.nfcCardRepository.findByIdm(unknownNfcCard.idm)) {
        this.logger.info("nfc card already registered", {
          code,
          discordId,
          idm: unknownNfcCard.idm,
          name,
          userId: user.id,
        });
        return err(
          new RegisterNfcCardError("NFC card already registered.", {
            meta: {
              code: "NFC_CARD_ALREADY_REGISTERED",
            },
          }),
        );
      }

      await this.unknownNfcCardRepository.deleteById(unknownNfcCard.id);
      await this.nfcCardRepository.create(name, unknownNfcCard.idm, user.id);
      this.logger.info("registered nfc card", {
        code,
        discordId,
        idm: unknownNfcCard.idm,
        name,
        userId: user.id,
      });

      return ok();
    } catch (caughtError) {
      const cause = caughtError instanceof Error ? caughtError : undefined;
      this.logger.error("register nfc card failed", {
        code,
        discordId,
        name,
        ...serializeError(caughtError),
      });
      const error = new RegisterNfcCardError("Failed to register nfc card.", {
        cause,
        meta: {
          code: "UNKNOWN",
        },
      });

      return err(error);
    }
  }
}

type ErrorMeta =
  | {
      code: "NFC_CARD_ALREADY_REGISTERED";
    }
  | {
      code: "NFC_CARD_NOT_FOUND";
    }
  | {
      code: "UNKNOWN";
    };

interface RegisterNfcCardErrorOptions extends ErrorOptions {
  meta: ErrorMeta;
}

export class RegisterNfcCardError extends AppError {
  meta: ErrorMeta;

  constructor(message: string, { meta, ...options }: RegisterNfcCardErrorOptions) {
    super(message, options);

    this.meta = meta;
  }
}
