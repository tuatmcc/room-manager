import type { AppLogger } from "@/logger";
import type { Repositories } from "@/repositories";

import { ExitAllEntryUsersUseCase } from "./ExitAllEntryUsers";
import { ForceExitEntryUserUseCase } from "./ForceExitEntryUser";
import { ListEntryUsersUseCase } from "./ListEntryUsers";
import { RegisterNfcCardUseCase } from "./RegisterNfcCard";
import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { TouchCardUseCase } from "./TouchCard";

export interface UseCases {
  exitAllEntryUsers: ExitAllEntryUsersUseCase;
  forceExitEntryUser: ForceExitEntryUserUseCase;
  listEntryUsers: ListEntryUsersUseCase;
  registerStudentCard: RegisterStudentCardUseCase;
  registerNfcCard: RegisterNfcCardUseCase;
  touchCard: TouchCardUseCase;
}

export function createUseCases(repositories: Repositories, logger: AppLogger): UseCases {
  return {
    exitAllEntryUsers: new ExitAllEntryUsersUseCase(
      repositories.user,
      repositories.roomEntryLog,
      logger.child({ tag: "exit-all-entry-users" }),
    ),
    forceExitEntryUser: new ForceExitEntryUserUseCase(
      repositories.user,
      repositories.roomEntryLog,
      logger.child({ tag: "force-exit-entry-user" }),
    ),
    listEntryUsers: new ListEntryUsersUseCase(
      repositories.user,
      logger.child({ tag: "list-entry-users" }),
    ),
    registerStudentCard: new RegisterStudentCardUseCase(
      repositories.user,
      repositories.studentCard,
      logger.child({ tag: "register-student-card" }),
    ),
    registerNfcCard: new RegisterNfcCardUseCase(
      repositories.user,
      repositories.nfcCard,
      repositories.unknownNfcCard,
      logger.child({ tag: "register-nfc-card" }),
    ),
    touchCard: new TouchCardUseCase(
      repositories.user,
      repositories.unknownNfcCard,
      repositories.roomEntryLog,
      logger.child({ tag: "touch-card" }),
    ),
  };
}
