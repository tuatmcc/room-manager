import type { Repositories } from "@/repositories";
import type { Services } from "@/services";

import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { RegisterSuicaCardUseCase } from "./RegisterSuicaCard";
import { TouchStudentCardUseCase } from "./TouchCard";

export interface UseCases {
	registerStudentCard: RegisterStudentCardUseCase;
	registerSuicaCard: RegisterSuicaCardUseCase;
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
		registerSuicaCard: new RegisterSuicaCardUseCase(
			repositories.user,
			repositories.suicaCard,
		),
		touchStudentCard: new TouchStudentCardUseCase(
			repositories.user,
			repositories.roomEntryLog,
			services.discord,
		),
	};
}
