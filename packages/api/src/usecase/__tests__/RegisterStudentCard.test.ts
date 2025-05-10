import { describe, expect, it, vi } from "vitest";

import { AppError, ERROR_CODE } from "@/error";
import { StudentCard } from "@/models/StudentCard";
import { User } from "@/models/User";
import type { StudentCardRepository } from "@/repositories/StudentCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { RegisterStudentCardUseCase } from "@/usecase/RegisterStudentCard";

const createMockUserRepository = () => {
	return {
		create: vi.fn(),
		save: vi.fn(),
		findByIds: vi.fn(),
		findByDiscordId: vi.fn(),
		findByStudentId: vi.fn(),
		findByNfcIdm: vi.fn(),
		findAllEntryUsers: vi.fn(),
	} satisfies UserRepository;
};

const createMockStudentCardRepository = () => {
	return {
		create: vi.fn(),
		save: vi.fn(),
		findByStudentId: vi.fn(),
		findByUserId: vi.fn(),
	} satisfies StudentCardRepository;
};

describe("RegisterStudentCardUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const studentCardRepository = createMockStudentCardRepository();
		const useCase = new RegisterStudentCardUseCase(
			userRepository,
			studentCardRepository,
		);

		return {
			useCase,
			userRepository,
			studentCardRepository,
		};
	};

	it("新規ユーザーに対して学生証を登録できること", async () => {
		// セットアップ
		const { useCase, userRepository, studentCardRepository } = setup();
		const discordId = "discord-user-1";
		const studentId = 12_345;
		const newUserId = 1;

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(null);
		userRepository.create.mockResolvedValue(new User(newUserId, discordId));
		studentCardRepository.findByStudentId.mockResolvedValue(null);
		studentCardRepository.findByUserId.mockResolvedValue(null);
		studentCardRepository.create.mockResolvedValue(
			new StudentCard(1, studentId, newUserId),
		);

		// 実行
		const result = await useCase.execute(discordId, studentId);

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				title: "学生証の登録が完了しました🎉",
				description: "学生証をリーダーにタッチすることで入退出が可能です。",
			});
		}
		expect(userRepository.findByDiscordId).toHaveBeenCalledWith(discordId);
		expect(userRepository.create).toHaveBeenCalledWith(discordId);
		expect(studentCardRepository.findByStudentId).toHaveBeenCalledWith(
			studentId,
		);
		expect(studentCardRepository.findByUserId).toHaveBeenCalledWith(newUserId);
		expect(studentCardRepository.create).toHaveBeenCalledWith(
			studentId,
			newUserId,
		);
	});

	it("既存ユーザーに対して新規学生証を登録できること", async () => {
		// セットアップ
		const { useCase, userRepository, studentCardRepository } = setup();
		const discordId = "discord-user-2";
		const studentId = 67_890;
		const existingUserId = 2;

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(
			new User(existingUserId, discordId),
		);
		studentCardRepository.findByStudentId.mockResolvedValue(null);
		studentCardRepository.findByUserId.mockResolvedValue(null);
		studentCardRepository.create.mockResolvedValue(
			new StudentCard(2, studentId, existingUserId),
		);

		// 実行
		const result = await useCase.execute(discordId, studentId);

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				title: "学生証の登録が完了しました🎉",
				description: "学生証をリーダーにタッチすることで入退出が可能です。",
			});
		}
		expect(userRepository.findByDiscordId).toHaveBeenCalledWith(discordId);
		expect(userRepository.create).not.toHaveBeenCalled();
		expect(studentCardRepository.findByStudentId).toHaveBeenCalledWith(
			studentId,
		);
		expect(studentCardRepository.findByUserId).toHaveBeenCalledWith(
			existingUserId,
		);
		expect(studentCardRepository.create).toHaveBeenCalledWith(
			studentId,
			existingUserId,
		);
	});

	it("既存ユーザーの学生証を更新できること", async () => {
		// セットアップ
		const { useCase, userRepository, studentCardRepository } = setup();
		const discordId = "discord-user-3";
		const oldStudentId = 11_111;
		const newStudentId = 22_222;
		const existingUserId = 3;
		const existingStudentCardId = 3;

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(
			new User(existingUserId, discordId),
		);
		studentCardRepository.findByStudentId.mockResolvedValue(null);

		const oldStudentCard = new StudentCard(
			existingStudentCardId,
			oldStudentId,
			existingUserId,
		);
		const newStudentCard = oldStudentCard.updateStudentId(newStudentId);

		studentCardRepository.findByUserId.mockResolvedValue(oldStudentCard);

		// 実行
		const result = await useCase.execute(discordId, newStudentId);

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				title: "学生証の登録が完了しました🎉",
				description:
					"学生証をリーダーにタッチすることで入退出が可能です。なお元の学生証は無効になります。",
			});
		}
		expect(userRepository.findByDiscordId).toHaveBeenCalledWith(discordId);
		expect(studentCardRepository.findByStudentId).toHaveBeenCalledWith(
			newStudentId,
		);
		expect(studentCardRepository.findByUserId).toHaveBeenCalledWith(
			existingUserId,
		);
		expect(studentCardRepository.save).toHaveBeenCalledWith(newStudentCard);
	});

	it("既に登録されている学生証番号に対してエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, studentCardRepository } = setup();
		const discordId = "discord-user-4";
		const duplicateStudentId = 33_333;
		const existingUserId = 4;

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(
			new User(existingUserId, discordId),
		);
		studentCardRepository.findByStudentId.mockResolvedValue(
			new StudentCard(4, duplicateStudentId, 999), // 別のユーザーIDで既に登録されている
		);

		// 実行
		const result = await useCase.execute(discordId, duplicateStudentId);

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(
				ERROR_CODE.STUDENT_CARD_ALREADY_REGISTERED,
			);
			expect(result.error.userMessage).toEqual({
				title: "学生証の登録に失敗しました",
				description: "すでに登録されている学生証番号です。",
			});
		}
	});

	it("例外が発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();
		const discordId = "discord-user-5";
		const studentId = 44_444;

		// モックの設定 - 例外をスロー
		userRepository.findByDiscordId.mockRejectedValue(new Error("DB接続エラー"));

		// 実行
		const result = await useCase.execute(discordId, studentId);

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "学生証の登録に失敗しました",
				description:
					"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
			});
		}
	});
});
