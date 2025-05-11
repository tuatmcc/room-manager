import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it, vi } from "vitest";

import { RoomEntryLog } from "@/models/RoomEntryLog";
import { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import {
	ExitAllEntryUsersError,
	ExitAllEntryUsersUseCase,
} from "@/usecase/ExitAllEntryUsers";

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

const createMockRoomEntryLogRepository = () => {
	return {
		create: vi.fn(),
		save: vi.fn(),
		findAllEntry: vi.fn(),
		findLastEntryByUserId: vi.fn(),
		setManyExitAt: vi.fn(),
	} satisfies RoomEntryLogRepository;
};

describe("ExitAllEntryUsersUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const roomEntryLogRepository = createMockRoomEntryLogRepository();
		const useCase = new ExitAllEntryUsersUseCase(
			userRepository,
			roomEntryLogRepository,
		);

		return {
			useCase,
			userRepository,
			roomEntryLogRepository,
		};
	};

	it("入室中のユーザーがいない場合は空の配列を返すこと", async () => {
		// セットアップ
		const { useCase, roomEntryLogRepository } = setup();

		// モックの設定
		roomEntryLogRepository.findAllEntry.mockResolvedValue([]);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({ users: [] });
		}
		expect(roomEntryLogRepository.findAllEntry).toHaveBeenCalled();
		expect(roomEntryLogRepository.setManyExitAt).not.toHaveBeenCalled();
	});

	it("入室中のユーザーがいる場合は全員を退出させてユーザー一覧を返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository } = setup();

		// モックの設定
		const now = Temporal.Now.instant();
		const entryLogs = [
			new RoomEntryLog(1, 1, now, null),
			new RoomEntryLog(2, 2, now, null),
		];
		const users = [
			new User(1, "discord-user-1"),
			new User(2, "discord-user-2"),
		];

		roomEntryLogRepository.findAllEntry.mockResolvedValue(entryLogs);
		roomEntryLogRepository.setManyExitAt.mockResolvedValue(undefined);
		userRepository.findByIds.mockResolvedValue(users);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({ users });
		}
		expect(roomEntryLogRepository.findAllEntry).toHaveBeenCalled();
		expect(roomEntryLogRepository.setManyExitAt).toHaveBeenCalledWith(
			[1, 2],
			expect.any(Temporal.Instant),
		);
		expect(userRepository.findByIds).toHaveBeenCalledWith([1, 2]);
	});

	it("RoomEntryLogRepositoryでエラーが発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, roomEntryLogRepository } = setup();

		// モックの設定 - 例外をスロー
		roomEntryLogRepository.findAllEntry.mockRejectedValue(
			new Error("DB接続エラー"),
		);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(ExitAllEntryUsersError);
			expect(result.error.meta.code).toBe("UNKNOWN");
		}
	});

	it("UserRepositoryでエラーが発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository } = setup();

		// モックの設定
		const now = Temporal.Now.instant();
		const entryLogs = [
			new RoomEntryLog(1, 1, now, null),
			new RoomEntryLog(2, 2, now, null),
		];

		roomEntryLogRepository.findAllEntry.mockResolvedValue(entryLogs);
		roomEntryLogRepository.setManyExitAt.mockResolvedValue(undefined);
		userRepository.findByIds.mockRejectedValue(new Error("DB接続エラー"));

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(ExitAllEntryUsersError);
			expect(result.error.meta.code).toBe("UNKNOWN");
		}
	});
});
