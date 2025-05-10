import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it, vi } from "vitest";

import type { Env } from "@/env";
import { ERROR_CODE } from "@/error";
import { RoomEntryLog } from "@/models/RoomEntryLog";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";
import { TouchCardUseCase } from "@/usecase/TouchCard";

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

const createMockUnknownNfcCardRepository = () => {
	return {
		create: vi.fn(),
		findByCode: vi.fn(),
		findByIdm: vi.fn(),
		deleteById: vi.fn(),
	} satisfies UnknownNfcCardRepository;
};

const createMockDiscordService = () => {
	return {
		fetchUserInfo: vi.fn(),
		sendMessage: vi.fn(),
	} satisfies DiscordService;
};

const createMockEnv = (): Env => {
	return {
		DISCORD_ROOM_COMMAND_ID: "command-id-1",
		DISCORD_ROOM_ADMIN_COMMAND_ID: "admin-command-id-1",
	} as Env;
};

describe("TouchCardUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const roomEntryLogRepository = createMockRoomEntryLogRepository();
		const unknownNfcCardRepository = createMockUnknownNfcCardRepository();
		const discordService = createMockDiscordService();
		const env = createMockEnv();
		const useCase = new TouchCardUseCase(
			userRepository,
			unknownNfcCardRepository,
			roomEntryLogRepository,
			discordService,
			env,
		);

		return {
			useCase,
			userRepository,
			roomEntryLogRepository,
			unknownNfcCardRepository,
			discordService,
			env,
		};
	};

	it("NFC IDMが登録されていない場合はエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, unknownNfcCardRepository } = setup();

		// モックの設定
		const idm = "unknown-idm";
		const newCode = "new-code-1";
		const newCardId = 1;

		userRepository.findByNfcIdm.mockResolvedValue(null);
		unknownNfcCardRepository.findByIdm.mockResolvedValue(null);
		unknownNfcCardRepository.create.mockResolvedValue(
			new UnknownNfcCard(newCardId, newCode, idm),
		);

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.errorCode).toBe(ERROR_CODE.NFC_CARD_NOT_REGISTERED);
			expect(result.error.userMessage).toEqual({
				title: "登録されていないNFCカードです",
				description: expect.stringContaining(newCode) as string,
			});
		}
		expect(userRepository.findByNfcIdm).toHaveBeenCalledWith(idm);
		expect(unknownNfcCardRepository.findByIdm).toHaveBeenCalledWith(idm);
		expect(unknownNfcCardRepository.create).toHaveBeenCalledWith(idm);
	});

	it("学生証が登録されていない場合はエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();

		// モックの設定
		const idm = "student-idm";
		const studentId = 12_345;

		userRepository.findByStudentId.mockResolvedValue(null);

		// 実行
		const result = await useCase.execute({ idm, studentId });

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.errorCode).toBe(
				ERROR_CODE.STUDENT_CARD_NOT_REGISTERED,
			);
			expect(result.error.userMessage).toEqual({
				title: "登録されていない学生証です",
				description: expect.any(String) as string,
			});
		}
		expect(userRepository.findByStudentId).toHaveBeenCalledWith(studentId);
	});

	it("入室していないユーザーがカードをタッチすると入室処理されること", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository, discordService } =
			setup();

		// モックの設定
		const idm = "registered-idm";
		const userId = 1;
		const now = Temporal.Now.instant();
		const newEntryLogId = 1;

		userRepository.findByNfcIdm.mockResolvedValue(
			new User(userId, "discord-user-1"),
		);
		roomEntryLogRepository.findLastEntryByUserId.mockResolvedValue(null);
		roomEntryLogRepository.create.mockResolvedValue(
			new RoomEntryLog(newEntryLogId, userId, now, null),
		);
		userRepository.findAllEntryUsers.mockResolvedValue([
			new User(userId, "discord-user-1"),
		]);
		discordService.fetchUserInfo.mockResolvedValue({
			name: "テストユーザー",
			iconUrl: "icon-url-1",
		});

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value.status).toBe("entry");
			expect(result.value.entries).toBe(1);
			expect(result.value.message.title).toBe(
				"テストユーザーさんが入室しました",
			);
			expect(result.value.message.color).toBe("green");
		}
		expect(userRepository.findByNfcIdm).toHaveBeenCalledWith(idm);
		expect(roomEntryLogRepository.findLastEntryByUserId).toHaveBeenCalledWith(
			userId,
		);
		expect(roomEntryLogRepository.create).toHaveBeenCalledWith(
			userId,
			expect.any(Temporal.Instant),
		);
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
		expect(discordService.fetchUserInfo).toHaveBeenCalledWith("discord-user-1");
	});

	it("入室中のユーザーがカードをタッチすると退室処理されること", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository, discordService } =
			setup();

		// モックの設定
		const idm = "registered-idm";
		const userId = 1;
		const now = Temporal.Now.instant();
		const entryLogId = 1;

		const existingEntryLog = new RoomEntryLog(entryLogId, userId, now, null);

		userRepository.findByNfcIdm.mockResolvedValue(
			new User(userId, "discord-user-1"),
		);
		roomEntryLogRepository.findLastEntryByUserId.mockResolvedValue(
			existingEntryLog,
		);
		roomEntryLogRepository.save.mockResolvedValue(undefined);
		userRepository.findAllEntryUsers.mockResolvedValue([]);
		discordService.fetchUserInfo.mockResolvedValue({
			name: "テストユーザー",
			iconUrl: "icon-url-1",
		});

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value.status).toBe("exit");
			expect(result.value.entries).toBe(0);
			expect(result.value.message.title).toBe(
				"テストユーザーさんが退出しました",
			);
			expect(result.value.message.color).toBe("red");
		}
		expect(userRepository.findByNfcIdm).toHaveBeenCalledWith(idm);
		expect(roomEntryLogRepository.findLastEntryByUserId).toHaveBeenCalledWith(
			userId,
		);
		expect(roomEntryLogRepository.save).toHaveBeenCalled();
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
		expect(discordService.fetchUserInfo).toHaveBeenCalledWith("discord-user-1");
	});

	it("DiscordServiceでエラーが発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository, discordService } =
			setup();

		// モックの設定
		const idm = "registered-idm";
		const userId = 1;

		userRepository.findByNfcIdm.mockResolvedValue(
			new User(userId, "discord-user-1"),
		);
		roomEntryLogRepository.findLastEntryByUserId.mockResolvedValue(null);
		discordService.fetchUserInfo.mockRejectedValue(
			new Error("Discord API エラー"),
		);

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "入退出に失敗しました",
				description: expect.stringContaining("不明なエラー") as string,
			});
		}
	});

	it("リポジトリでエラーが発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();

		// モックの設定
		const idm = "registered-idm";

		userRepository.findByNfcIdm.mockRejectedValue(new Error("DB接続エラー"));

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "入退出に失敗しました",
				description: expect.stringContaining("不明なエラー") as string,
			});
		}
	});
});
