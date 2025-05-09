import type { Env } from "@/env";
import type { Repositories } from "@/repositories";
import type { Services } from "@/services";

import { ExitAllEntryUsersUseCase } from "./ExitAllEntryUsers";
import { ListEntryUsersUseCase } from "./ListEntryUsers";
import { RegisterNfcCardUseCase } from "./RegisterNfcCard";
import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { TouchCardUseCase } from "./TouchCard";

export interface UseCases {
	exitAllEntryUsers: ExitAllEntryUsersUseCase;
	listEntryUsers: ListEntryUsersUseCase;
	registerStudentCard: RegisterStudentCardUseCase;
	registerNfcCard: RegisterNfcCardUseCase;
	touchCard: TouchCardUseCase;
}

export function createUseCases(
	repositories: Repositories,
	services: Services,
	env: Env,
): UseCases {
	return {
		exitAllEntryUsers: new ExitAllEntryUsersUseCase(
			repositories.user,
			repositories.roomEntryLog,
		),
		listEntryUsers: new ListEntryUsersUseCase(
			repositories.user,
			services.discord,
		),
		registerStudentCard: new RegisterStudentCardUseCase(
			repositories.user,
			repositories.studentCard,
		),
		registerNfcCard: new RegisterNfcCardUseCase(
			repositories.user,
			repositories.nfcCard,
			repositories.unknownNfcCard,
		),
		touchCard: new TouchCardUseCase(
			repositories.user,
			repositories.unknownNfcCard,
			repositories.roomEntryLog,
			services.discord,
			env,
		),
	};
}
