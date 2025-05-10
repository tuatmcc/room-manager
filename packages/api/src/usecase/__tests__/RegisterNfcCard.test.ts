import { describe, expect, it, vi } from "vitest";

import { AppError, ERROR_CODE } from "@/error";
import { NfcCard } from "@/models/NfcCard";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import { User } from "@/models/User";
import type { NfcCardRepository } from "@/repositories/NfcCardRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { RegisterNfcCardUseCase } from "@/usecase/RegisterNfcCard";

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

const createMockNfcCardRepository = () => {
	return {
		create: vi.fn(),
		save: vi.fn(),
		findByIdm: vi.fn(),
	} satisfies NfcCardRepository;
};

const createMockUnknownNfcCardRepository = () => {
	return {
		create: vi.fn(),
		findByCode: vi.fn(),
		findByIdm: vi.fn(),
		deleteById: vi.fn(),
	} satisfies UnknownNfcCardRepository;
};

describe("RegisterNfcCardUseCase", () => {
	// テスト前に各テストケースで使用するモックとユースケースインスタンスを設定
	const setup = () => {
		const userRepository = createMockUserRepository();
		const nfcCardRepository = createMockNfcCardRepository();
		const unknownNfcCardRepository = createMockUnknownNfcCardRepository();
		const useCase = new RegisterNfcCardUseCase(
			userRepository,
			nfcCardRepository,
			unknownNfcCardRepository,
		);

		return {
			useCase,
			userRepository,
			nfcCardRepository,
			unknownNfcCardRepository,
		};
	};

	it("新規ユーザーに対してNFCカードを登録できること", async () => {
		// セットアップ
		const {
			useCase,
			userRepository,
			nfcCardRepository,
			unknownNfcCardRepository,
		} = setup();
		const discordId = "discord-user-1";
		const code = "code-1";
		const name = "テスト用カード";
		const newUserId = 1;
		const idm = "idm-12345";

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(null);
		userRepository.create.mockResolvedValue(new User(newUserId, discordId));
		unknownNfcCardRepository.findByCode.mockResolvedValue(
			new UnknownNfcCard(1, code, idm),
		);
		nfcCardRepository.findByIdm.mockResolvedValue(null);
		nfcCardRepository.create.mockResolvedValue(
			new NfcCard(1, name, idm, newUserId),
		);

		// 実行
		const result = await useCase.execute(discordId, code, name);

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				title: "NFCカードの登録が完了しました🎉",
				description: "NFCカードをリーダーにタッチすることで入退出が可能です。",
			});
		}
		expect(userRepository.findByDiscordId).toHaveBeenCalledWith(discordId);
		expect(userRepository.create).toHaveBeenCalledWith(discordId);
		expect(unknownNfcCardRepository.findByCode).toHaveBeenCalledWith(code);
		expect(nfcCardRepository.findByIdm).toHaveBeenCalledWith(idm);
		expect(unknownNfcCardRepository.deleteById).toHaveBeenCalledWith(1);
		expect(nfcCardRepository.create).toHaveBeenCalledWith(name, idm, newUserId);
	});

	it("既存ユーザーに対してNFCカードを登録できること", async () => {
		// セットアップ
		const {
			useCase,
			userRepository,
			nfcCardRepository,
			unknownNfcCardRepository,
		} = setup();
		const discordId = "discord-user-2";
		const code = "code-2";
		const name = "既存ユーザーカード";
		const existingUserId = 2;
		const idm = "idm-67890";

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(
			new User(existingUserId, discordId),
		);
		unknownNfcCardRepository.findByCode.mockResolvedValue(
			new UnknownNfcCard(2, code, idm),
		);
		nfcCardRepository.findByIdm.mockResolvedValue(null);
		nfcCardRepository.create.mockResolvedValue(
			new NfcCard(2, name, idm, existingUserId),
		);

		// 実行
		const result = await useCase.execute(discordId, code, name);

		// 検証
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				title: "NFCカードの登録が完了しました🎉",
				description: "NFCカードをリーダーにタッチすることで入退出が可能です。",
			});
		}
		expect(userRepository.findByDiscordId).toHaveBeenCalledWith(discordId);
		expect(userRepository.create).not.toHaveBeenCalled();
		expect(unknownNfcCardRepository.findByCode).toHaveBeenCalledWith(code);
		expect(nfcCardRepository.findByIdm).toHaveBeenCalledWith(idm);
		expect(unknownNfcCardRepository.deleteById).toHaveBeenCalledWith(2);
		expect(nfcCardRepository.create).toHaveBeenCalledWith(
			name,
			idm,
			existingUserId,
		);
	});

	it("不明なNFCカードの場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository, unknownNfcCardRepository } = setup();
		const discordId = "discord-user-3";
		const code = "unknown-code";
		const name = "不明カード";
		const existingUserId = 3;

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(
			new User(existingUserId, discordId),
		);
		unknownNfcCardRepository.findByCode.mockResolvedValue(null);

		// 実行
		const result = await useCase.execute(discordId, code, name);

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN_NFC_CARD);
			expect(result.error.userMessage).toEqual({
				title: "NFCカードの登録に失敗しました",
				description: "不明なNFCカードです。",
			});
		}
	});

	it("既に登録されているNFCカードの場合にエラーを返すこと", async () => {
		// セットアップ
		const {
			useCase,
			userRepository,
			nfcCardRepository,
			unknownNfcCardRepository,
		} = setup();
		const discordId = "discord-user-4";
		const code = "code-4";
		const name = "重複カード";
		const existingUserId = 4;
		const idm = "idm-already-registered";

		// モックの設定
		userRepository.findByDiscordId.mockResolvedValue(
			new User(existingUserId, discordId),
		);
		unknownNfcCardRepository.findByCode.mockResolvedValue(
			new UnknownNfcCard(4, code, idm),
		);
		nfcCardRepository.findByIdm.mockResolvedValue(
			new NfcCard(99, "既存カード", idm, 999), // 既に別のユーザーで登録済み
		);

		// 実行
		const result = await useCase.execute(discordId, code, name);

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(
				ERROR_CODE.NFC_CARD_ALREADY_REGISTERED,
			);
			expect(result.error.userMessage).toEqual({
				title: "NFCカードの登録に失敗しました",
				description: "すでに登録されているNFCカードです。",
			});
		}
	});

	it("例外が発生した場合にエラーを返すこと", async () => {
		// セットアップ
		const { useCase, userRepository } = setup();
		const discordId = "discord-user-5";
		const code = "code-5";
		const name = "エラーテストカード";

		// モックの設定 - 例外をスロー
		userRepository.findByDiscordId.mockRejectedValue(new Error("DB接続エラー"));

		// 実行
		const result = await useCase.execute(discordId, code, name);

		// 検証
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBeInstanceOf(AppError);
			expect(result.error.errorCode).toBe(ERROR_CODE.UNKNOWN);
			expect(result.error.userMessage).toEqual({
				title: "NFCカードの登録に失敗しました",
				description:
					"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
			});
		}
	});
});
