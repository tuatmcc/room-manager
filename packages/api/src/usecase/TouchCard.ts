import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { UnknownNfcCard } from "@/models/UnknownNfcCard";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export type TouchCardStatus = "entry" | "exit";

export interface TouchCardResult {
  status: TouchCardStatus;
  entries: number;
  user: User;
}

export class TouchCardUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly unknownNfcCardRepository: UnknownNfcCardRepository,
    private readonly roomEntryLogRepository: RoomEntryLogRepository,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async execute({
    idm,
    studentId,
  }: {
    idm: string;
    studentId?: number;
  }): Promise<Result<TouchCardResult, TouchCardError>> {
    this.logger.info("touch card started", {
      idm,
      studentId,
    });
    try {
      // ユーザーを特定
      const userResult =
        studentId != null
          ? await this.findUserByStudentId(studentId)
          : await this.findUserByNfcIdm(idm);
      if (userResult.isErr()) {
        return err(userResult.error);
      }
      const user = userResult.value;

      // 入退室処理を実行
      const result = await this.toggleUserRoomPresence(user);
      this.logger.info("touch card completed", {
        discordId: user.discordId,
        entries: result.entries,
        status: result.status,
        userId: user.id,
      });

      return ok(result);
    } catch (caughtError) {
      const cause = caughtError instanceof Error ? caughtError : undefined;
      this.logger.error("touch card failed", {
        idm,
        studentId,
        ...serializeError(caughtError),
      });
      const error = new TouchCardError("Failed to touch card.", {
        cause,
        meta: {
          code: "UNKNOWN",
        },
      });

      return err(error);
    }
  }

  private async findUserByStudentId(studentId: number): Promise<Result<User, TouchCardError>> {
    const user = await this.userRepository.findByStudentId(studentId);
    if (!user) {
      this.logger.info("student card not registered", { studentId });
      return err(
        new TouchCardError("Student card not registered.", {
          meta: {
            code: "STUDENT_CARD_NOT_REGISTERED",
          },
        }),
      );
    }

    this.logger.info("resolved user by student card", {
      discordId: user.discordId,
      studentId,
      userId: user.id,
    });
    return ok(user);
  }

  private async findUserByNfcIdm(idm: string): Promise<Result<User, TouchCardError>> {
    const user = await this.userRepository.findByNfcIdm(idm);
    if (!user) {
      const unknownNfcCard =
        (await this.unknownNfcCardRepository.findByIdm(idm)) ??
        (await this.unknownNfcCardRepository.create(idm));

      this.logger.info("nfc card not registered", {
        code: unknownNfcCard.code,
        idm,
        unknownNfcCardId: unknownNfcCard.id,
      });
      return err(
        new TouchCardError("NFC card not registered.", {
          meta: {
            code: "NFC_CARD_NOT_REGISTERED",
            unknownNfcCard,
          },
        }),
      );
    }

    this.logger.info("resolved user by nfc card", {
      discordId: user.discordId,
      idm,
      userId: user.id,
    });
    return ok(user);
  }

  private async toggleUserRoomPresence(user: User): Promise<TouchCardResult> {
    const now = Temporal.Now.instant();
    const status = await this.roomEntryLogRepository.toggle(user.id, now);

    // 入室中のユーザーを取得
    const entryUsers = await this.userRepository.findAllEntryUsers();
    this.logger.info("toggled room presence", {
      discordId: user.discordId,
      entries: entryUsers.length,
      status,
      userId: user.id,
    });

    return {
      status,
      entries: entryUsers.length,
      user,
    };
  }
}

type ErrorMeta =
  | {
      code: "STUDENT_CARD_NOT_REGISTERED";
    }
  | {
      code: "NFC_CARD_NOT_REGISTERED";
      unknownNfcCard: UnknownNfcCard;
    }
  | {
      code: "UNKNOWN";
    };

interface TouchCardErrorOptions extends ErrorOptions {
  meta: ErrorMeta;
}

export class TouchCardError extends AppError {
  meta: ErrorMeta;

  constructor(message: string, { meta, ...options }: TouchCardErrorOptions) {
    super(message, options);

    this.meta = meta;
  }
}
