import type { Repositories } from "@/repositories";
import type { Services } from "@/services";

import { RegisterNfcCardUseCase } from "./RegisterNfcCard";
import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { TouchStudentCardUseCase } from "./TouchCard";

export interface UseCases {
	registerStudentCard: RegisterStudentCardUseCase;
	registerNfcCard: RegisterNfcCardUseCase;
	touchStudentCard: TouchStudentCardUseCase;
}

export function createUseCases(
	repositories: Repositories,
	services: Services,
): UseCases {
	return {
		registerStudentCard: new RegisterStudentCardUseCase(
			repositories.user,
			repositories.studentCard,
		),
		registerNfcCard: new RegisterNfcCardUseCase(
			repositories.user,
			repositories.nfcCard,
		),
		touchStudentCard: new TouchStudentCardUseCase(
			repositories.user,
			repositories.roomEntryLog,
			services.discord,
		),
	};
}
