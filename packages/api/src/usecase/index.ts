import type { Repositories } from "@/repositories";

import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { TouchStudentCardUseCase } from "./TouchStudentCard";

export interface UseCases {
	registerStudentCard: RegisterStudentCardUseCase;
	touchStudentCard: TouchStudentCardUseCase;
}

export function createUseCases(repositories: Repositories): UseCases {
	return {
		registerStudentCard: new RegisterStudentCardUseCase(
			repositories.user,
			repositories.studentCard,
		),
		touchStudentCard: new TouchStudentCardUseCase(
			repositories.user,
			repositories.roomEntryLog,
		),
	};
}
