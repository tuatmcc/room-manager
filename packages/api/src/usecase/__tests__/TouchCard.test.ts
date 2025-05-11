import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it, vi } from "vitest";

import { RoomEntryLog } from "@/models/RoomEntryLog";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { TouchCardError, TouchCardUseCase } from "@/usecase/TouchCard";

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

describe("TouchCardUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const roomEntryLogRepository = createMockRoomEntryLogRepository();
		const unknownNfcCardRepository = createMockUnknownNfcCardRepository();
		const useCase = new TouchCardUseCase(
			userRepository,
			unknownNfcCardRepository,
			roomEntryLogRepository,
		);

		return {
			useCase,
			userRepository,
			roomEntryLogRepository,
			unknownNfcCardRepository,
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
			expect(result.error).toBeInstanceOf(TouchCardError);
			expect(result.error.meta.code).toBe("NFC_CARD_NOT_REGISTERED");
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
			expect(result.error).toBeInstanceOf(TouchCardError);
			expect(result.error.meta.code).toBe("STUDENT_CARD_NOT_REGISTERED");
		}
		expect(userRepository.findByStudentId).toHaveBeenCalledWith(studentId);
	});

	it("入室していないユーザーがカードをタッチすると入室処理されること", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository } = setup();

		// モックの設定
		const idm = "registered-idm";
		const userId = 1;
		const user = new User(userId, "discord-user-1");
		const now = Temporal.Now.instant();
		const newEntryLogId = 1;

		userRepository.findByNfcIdm.mockResolvedValue(user);
		roomEntryLogRepository.findLastEntryByUserId.mockResolvedValue(null);
		roomEntryLogRepository.create.mockResolvedValue(
			new RoomEntryLog(newEntryLogId, userId, now, null),
		);
		userRepository.findAllEntryUsers.mockResolvedValue([user]);

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value.status).toBe("entry");
			expect(result.value.entries).toBe(1);
			expect(result.value.user).toEqual(user);
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
	});

	it("入室中のユーザーがカードをタッチすると退室処理されること", async () => {
		// セットアップ
		const { useCase, userRepository, roomEntryLogRepository } = setup();

		// モックの設定
		const idm = "registered-idm";
		const userId = 1;
		const user = new User(userId, "discord-user-1");
		const now = Temporal.Now.instant();
		const entryLogId = 1;
		const oldEntryLog = new RoomEntryLog(
			entryLogId,
			userId,
			Temporal.Instant.from("2023-01-01T10:00:00Z"),
			null,
		);
		const newEntryLog = oldEntryLog.exitRoom(now);

		userRepository.findByNfcIdm.mockResolvedValue(user);
		roomEntryLogRepository.findLastEntryByUserId.mockResolvedValue(oldEntryLog);
		roomEntryLogRepository.save.mockResolvedValue(newEntryLog);
		userRepository.findAllEntryUsers.mockResolvedValue([]);

		// 実行
		const result = await useCase.execute({ idm });

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value.status).toBe("exit");
			expect(result.value.entries).toBe(0);
			expect(result.value.user).toEqual(user);
		}
		expect(userRepository.findByNfcIdm).toHaveBeenCalledWith(idm);
		expect(roomEntryLogRepository.findLastEntryByUserId).toHaveBeenCalledWith(
			userId,
		);
		expect(roomEntryLogRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				id: entryLogId,
				userId,
				// eslint-disable-next-line typescript/no-unsafe-assignment
				exitAt: expect.any(Temporal.Instant),
			}),
		);
		expect(userRepository.findAllEntryUsers).toHaveBeenCalled();
	});

	it("例外が発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();

		// モックの設定 - 例外をスロー
		userRepository.findByNfcIdm.mockRejectedValue(new Error("DB接続エラー"));

		// 実行
		const result = await useCase.execute({ idm: "any-idm" });

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(TouchCardError);
			expect(result.error.meta.code).toBe("UNKNOWN");
		}
	});
});
