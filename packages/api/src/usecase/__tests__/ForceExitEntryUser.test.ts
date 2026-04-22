import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it, vi } from "vitest";

import { RoomEntryLog } from "@/models/RoomEntryLog";
import { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { ForceExitEntryUserError, ForceExitEntryUserUseCase } from "@/usecase/ForceExitEntryUser";

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
    findAllEntry: vi.fn(),
    setManyExitAt: vi.fn(),
    toggle: vi.fn(),
  } satisfies RoomEntryLogRepository;
};

describe("ForceExitEntryUserUseCase", () => {
  const setup = () => {
    const userRepository = createMockUserRepository();
    const roomEntryLogRepository = createMockRoomEntryLogRepository();
    const useCase = new ForceExitEntryUserUseCase(userRepository, roomEntryLogRepository);

    return {
      useCase,
      userRepository,
      roomEntryLogRepository,
    };
  };

  it("対象ユーザーが入室中の場合は退出扱いにできること", async () => {
    const { useCase, roomEntryLogRepository, userRepository } = setup();
    const entryAt = Temporal.Now.instant();
    const targetUser = new User(2, "discord-user-2");

    roomEntryLogRepository.findAllEntry.mockResolvedValue([
      new RoomEntryLog(1, 1, entryAt, null),
      new RoomEntryLog(2, 2, entryAt, null),
    ]);
    roomEntryLogRepository.setManyExitAt.mockResolvedValue(undefined);
    userRepository.findByIds.mockResolvedValue([targetUser]);

    const result = await useCase.execute(2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ user: targetUser });
    }
    expect(roomEntryLogRepository.setManyExitAt).toHaveBeenCalledWith(
      [2],
      expect.any(Temporal.Instant),
    );
    expect(userRepository.findByIds).toHaveBeenCalledWith([2]);
  });

  it("対象ユーザーが入室中でない場合は TARGET_NOT_IN_ROOM を返すこと", async () => {
    const { useCase, roomEntryLogRepository } = setup();
    const entryAt = Temporal.Now.instant();

    roomEntryLogRepository.findAllEntry.mockResolvedValue([new RoomEntryLog(1, 1, entryAt, null)]);

    const result = await useCase.execute(2);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ForceExitEntryUserError);
      expect(result.error.meta.code).toBe("TARGET_NOT_IN_ROOM");
    }
    expect(roomEntryLogRepository.setManyExitAt).toHaveBeenCalledTimes(0);
  });

  it("ユーザー取得に失敗した場合は TARGET_USER_NOT_FOUND を返すこと", async () => {
    const { useCase, roomEntryLogRepository, userRepository } = setup();
    const entryAt = Temporal.Now.instant();

    roomEntryLogRepository.findAllEntry.mockResolvedValue([new RoomEntryLog(2, 2, entryAt, null)]);
    roomEntryLogRepository.setManyExitAt.mockResolvedValue(undefined);
    userRepository.findByIds.mockResolvedValue([]);

    const result = await useCase.execute(2);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ForceExitEntryUserError);
      expect(result.error.meta.code).toBe("TARGET_USER_NOT_FOUND");
    }
  });

  it("例外が発生した場合は UNKNOWN を返すこと", async () => {
    const { useCase, roomEntryLogRepository } = setup();
    roomEntryLogRepository.findAllEntry.mockRejectedValue(new Error("DB接続エラー"));

    const result = await useCase.execute(2);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ForceExitEntryUserError);
      expect(result.error.meta.code).toBe("UNKNOWN");
    }
  });
});
