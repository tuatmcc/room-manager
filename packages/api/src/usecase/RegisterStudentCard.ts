import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { StudentCardRepository } from "@/repositories/StudentCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export interface RegisterStudentCardResult {
	status: "created" | "updated";
}

export class RegisterStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly studentCardRepository: StudentCardRepository,
		private readonly logger: AppLogger = noopLogger,
	) {}

	async execute(
		discordId: string,
		studentId: number,
	): Promise<Result<RegisterStudentCardResult, RegisterStudentCardError>> {
		this.logger.info("register student card started", {
			discordId,
			studentId,
		});
		try {
			const user =
				(await this.userRepository.findByDiscordId(discordId)) ??
				(await this.userRepository.create(discordId));

			// すでに登録されている学生証番号は登録できない
			if (await this.studentCardRepository.findByStudentId(studentId)) {
				this.logger.info("student card already registered", {
					discordId,
					studentId,
					userId: user.id,
				});
				return err(
					new RegisterStudentCardError("Student card already registered.", {
						meta: {
							code: "STUDENT_CARD_ALREADY_REGISTERED",
						},
					}),
				);
			}

			const oldStudentCard = await this.studentCardRepository.findByUserId(
				user.id,
			);
			// 学生証が存在しない場合は新規作成して終了
			if (!oldStudentCard) {
				await this.studentCardRepository.create(studentId, user.id);
				this.logger.info("registered new student card", {
					discordId,
					studentId,
					userId: user.id,
				});
				return ok({ status: "created" });
			}

			// 学籍番号を更新
			const newStudentCard = oldStudentCard.updateStudentId(studentId);
			await this.studentCardRepository.save(newStudentCard);
			this.logger.info("updated student card", {
				discordId,
				studentId,
				userId: user.id,
			});

			return ok({ status: "updated" });
		} catch (caughtError) {
			const cause = caughtError instanceof Error ? caughtError : undefined;
			this.logger.error("register student card failed", {
				discordId,
				studentId,
				...serializeError(caughtError),
			});
			const error = new RegisterStudentCardError(
				"Failed to register student card.",
				{
					cause,
					meta: {
						code: "UNKNOWN",
					},
				},
			);

			return err(error);
		}
	}
}

type ErrorMeta =
	| {
			code: "STUDENT_CARD_ALREADY_REGISTERED";
	  }
	| {
			code: "UNKNOWN";
	  };

interface RegisterStudentCardErrorOptions extends ErrorOptions {
	meta: ErrorMeta;
}

export class RegisterStudentCardError extends AppError {
	meta: ErrorMeta;

	constructor(
		message: string,
		{ meta, ...options }: RegisterStudentCardErrorOptions,
	) {
		super(message, options);

		this.meta = meta;
	}
}
