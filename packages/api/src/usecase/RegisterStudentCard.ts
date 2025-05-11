import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import { StudentCard } from "@/models/StudentCard";
import { User } from "@/models/User";
import type { StudentCardRepository } from "@/repositories/StudentCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

export interface RegisterStudentCardResult {
	status: "created" | "updated";
}

export class RegisterStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly studentCardRepository: StudentCardRepository,
	) {}

	async execute(
		discordId: string,
		studentId: number,
	): Promise<Result<RegisterStudentCardResult, RegisterStudentCardError>> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.register_student_card",
			{
				attributes: {
					[User.ATTRIBUTES.DISCORD_ID]: discordId,
					[StudentCard.ATTRIBUTES.STUDENT_ID]: studentId,
				},
			},
			async (
				span,
			): Promise<
				Result<RegisterStudentCardResult, RegisterStudentCardError>
			> => {
				try {
					const user =
						(await this.userRepository.findByDiscordId(discordId)) ??
						(await this.userRepository.create(discordId));
					user.setAttributes();

					// すでに登録されている学生証番号は登録できない
					if (await this.studentCardRepository.findByStudentId(studentId)) {
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
						const newStudentCard = await this.studentCardRepository.create(
							studentId,
							user.id,
						);
						newStudentCard.setAttributes();
						return ok({ status: "created" });
					}

					// 学籍番号を更新
					const newStudentCard = oldStudentCard.updateStudentId(studentId);
					await this.studentCardRepository.save(newStudentCard);
					newStudentCard.setAttributes();

					return ok({ status: "updated" });
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new RegisterStudentCardError(
						"Failed to register student card.",
						{
							cause,
							meta: {
								code: "UNKNOWN",
							},
						},
					);

					span.recordException(error);
					return err(error);
				} finally {
					span.end();
				}
			},
		);
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
