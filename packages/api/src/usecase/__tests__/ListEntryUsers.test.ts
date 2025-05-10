import { describe, expect, it, vi } from "vitest";

import { AppError, ERROR_CODE } from "@/error";
import { User } from "@/models/User";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";
import { ListEntryUsersUseCase } from "@/usecase/ListEntryUsers";

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

const createMockDiscordService = () => {
	return {
		fetchUserInfo: vi.fn(),
		sendMessage: vi.fn(),
	} satisfies DiscordService;
};

describe("ListEntryUsersUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const discordService = createMockDiscordService();
		const useCase = new ListEntryUsersUseCase(userRepository, discordService);

		return {
			useCase,
			userRepository,
			discordService,
		};
	};

	it("入室中のユーザーがいない場合は適切なメッセージを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();

		// モックの設定
		userRepository.findAllEntryUsers.mockResolvedValue([]);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				author: "入室中のメンバー",
				description: "部室には誰も居ません",
				color: "red",
			});
		}
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
	});

	it("入室中のユーザーがいる場合は名前一覧を返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, discordService } = setup();
		const users = [
			new User(1, "discord-user-1"),
			new User(2, "discord-user-2"),
		];

		// モックの設定
		userRepository.findAllEntryUsers.mockResolvedValue(users);
		discordService.fetchUserInfo.mockImplementation(
			async (discordId: string) => {
				switch (discordId) {
					case "discord-user-1":
						return await Promise.resolve({
							name: "ユーザー1",
							iconUrl: "icon-url-1",
						});
					case "discord-user-2":
						return await Promise.resolve({
							name: "ユーザー2",
							iconUrl: "icon-url-2",
						});
					default:
						throw new Error(`テストエラー: 予期しないdiscordId ${discordId}`);
				}
			},
		);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				author: "入室中のメンバー",
				description: "2人が入室中です\n* ユーザー1\n* ユーザー2",
			});
		}
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
		expect(discordService.fetchUserInfo).toHaveBeenCalledWith("discord-user-1");
		expect(discordService.fetchUserInfo).toHaveBeenCalledWith("discord-user-2");
	});

	it("DiscordServiceでエラーが発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, discordService } = setup();
		const users = [new User(1, "discord-user-1")];

		// モックの設定
		userRepository.findAllEntryUsers.mockResolvedValue(users);
		discordService.fetchUserInfo.mockRejectedValue(
			new Error("Discord API エラー"),
		);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "入室者一覧の取得に失敗しました",
				description:
					"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
			});
		}
	});

	it("UserRepositoryでエラーが発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();

		// モックの設定 - 例外をスロー
		userRepository.findAllEntryUsers.mockRejectedValue(
			new Error("DB接続エラー"),
		);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "入室者一覧の取得に失敗しました",
				description:
					"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
			});
		}
	});
});
