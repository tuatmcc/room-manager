import type { Repositories } from "@/repositories";

import { RegisterStudentCardUseCase } from "./RegisterStudentCard";

export interface UseCases {
	registerStudentCard: RegisterStudentCardUseCase;
}

export function createUseCases(repositories: Repositories): UseCases {
	return {
		registerStudentCard: new RegisterStudentCardUseCase(repositories.user),
	};
}
