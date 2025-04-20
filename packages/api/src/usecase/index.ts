import type { Repositories } from "@/repositories";
import type { Services } from "@/services";

import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { TouchStudentCardUseCase } from "./TouchCard";

export interface UseCases {
	registerStudentCard: RegisterStudentCardUseCase;
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
		touchStudentCard: new TouchStudentCardUseCase(
			repositories.user,
			repositories.roomEntryLog,
			services.discord,
		),
	};
}
