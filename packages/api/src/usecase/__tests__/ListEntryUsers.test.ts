import { describe, expect, it, vi } from "vitest";

import { User } from "@/models/User";
import type { UserRepository } from "@/repositories/UserRepository";
import {
	ListEntryUsersError,
	ListEntryUsersUseCase,
} from "@/usecase/ListEntryUsers";

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

describe("ListEntryUsersUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const useCase = new ListEntryUsersUseCase(userRepository);

		return {
			useCase,
			userRepository,
		};
	};

	it("入室中のユーザーがいない場合は空の配列を返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();

		// モックの設定
		userRepository.findAllEntryUsers.mockResolvedValue([]);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({ users: [] });
		}
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
	});

	it("入室中のユーザーがいる場合はユーザー一覧を返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();
		const users = [
			new User(1, "discord-user-1"),
			new User(2, "discord-user-2"),
		];

		// モックの設定
		userRepository.findAllEntryUsers.mockResolvedValue(users);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({ users });
		}
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
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
			expect(result.error).toBeInstanceOf(ListEntryUsersError);
			expect(result.error.meta.code).toBe("UNKNOWN");
		}
	});
});
