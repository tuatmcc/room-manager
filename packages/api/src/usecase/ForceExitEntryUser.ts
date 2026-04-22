import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export interface ForceExitEntryUserResult {
  user: User;
}

export class ForceExitEntryUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roomEntryLogRepository: RoomEntryLogRepository,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async execute(userId: number): Promise<Result<ForceExitEntryUserResult, ForceExitEntryUserError>> {
    try {
      const entryLogs = await this.roomEntryLogRepository.findAllEntry();
      const targetEntryLog = entryLogs.find((entryLog) => entryLog.userId === userId);
      if (!targetEntryLog) {
        this.logger.info("force exit target was not in room", { userId });
        return err(
          new ForceExitEntryUserError("Target user is not in room.", {
            meta: {
              code: "TARGET_NOT_IN_ROOM",
            },
          }),
        );
      }

      await this.roomEntryLogRepository.setManyExitAt([targetEntryLog.id], Temporal.Now.instant());

      const users = await this.userRepository.findByIds([userId]);
      const user = users.at(0);
      if (!user) {
        this.logger.warn("force exit target user could not be loaded after update", {
          targetEntryLogId: targetEntryLog.id,
          userId,
        });
        return err(
          new ForceExitEntryUserError("Target user was not found.", {
            meta: {
              code: "TARGET_USER_NOT_FOUND",
            },
          }),
        );
      }

      this.logger.info("forced exit target user", {
        targetEntryLogId: targetEntryLog.id,
        userId,
      });
      return ok({ user });
    } catch (caughtError) {
      const cause = caughtError instanceof Error ? caughtError : undefined;
      this.logger.error("failed to force exit target user", {
        userId,
        ...serializeError(caughtError),
      });
      return err(
        new ForceExitEntryUserError("Failed to force exit target user.", {
          cause,
          meta: {
            code: "UNKNOWN",
          },
        }),
      );
    }
  }
}

type ErrorMeta =
  | {
      code: "TARGET_NOT_IN_ROOM";
    }
  | {
      code: "TARGET_USER_NOT_FOUND";
    }
  | {
      code: "UNKNOWN";
    };

interface ForceExitEntryUserErrorOptions extends ErrorOptions {
  meta: ErrorMeta;
}

export class ForceExitEntryUserError extends AppError {
  meta: ErrorMeta;

  constructor(message: string, { meta, ...options }: ForceExitEntryUserErrorOptions) {
    super(message, options);
    this.meta = meta;
  }
}
