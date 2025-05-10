import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it, vi } from "vitest";

import { AppError, ERROR_CODE } from "@/error";
import { RoomEntryLog } from "@/models/RoomEntryLog";
import { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { ExitAllEntryUsersUseCase } from "@/usecase/ExitAllEntryUsers";

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

	it("入室中のユーザーがいない場合はnullを返すこと", async () => {
		// セットアップ
		const { useCase, roomEntryLogRepository } = setup();

		// モックの設定
		roomEntryLogRepository.findAllEntry.mockResolvedValue([]);

		// 実行
		const result = await useCase.execute();

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toBeNull();
		}
		expect(roomEntryLogRepository.findAllEntry).toHaveBeenCalled();
		expect(roomEntryLogRepository.setManyExitAt).not.toHaveBeenCalled();
	});

	it("入室中のユーザーがいる場合は全員を退出させて適切なメッセージを返すこと", async () => {
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
			expect(result.value).toEqual({
				title: "自動退出",
				description:
					"以下のメンバーを自動的に退出させました。退出を忘れないようにしましょう！\n* <@discord-user-1>\n* <@discord-user-2>",
				color: "red",
			});
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
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "自動退出に失敗しました",
				description:
					"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
			});
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
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "自動退出に失敗しました",
				description:
					"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
			});
		}
	});
});
