import type { Repositories } from "@/repositories";

import { RegisterStudentCardUseCase } from "./RegisterStudentCard";
import { TouchCardUseCase } from "./TouchCard";

export interface UseCases {
	registerStudentCard: RegisterStudentCardUseCase;
	touchCard: TouchCardUseCase;
}

export function createUseCases(repositories: Repositories): UseCases {
	return {
		registerStudentCard: new RegisterStudentCardUseCase(
			repositories.user,
			repositories.studentCard,
		),
		touchCard: new TouchCardUseCase(repositories.user),
	};
}
