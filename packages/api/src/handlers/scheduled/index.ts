import type { Services } from "@/services";
import type { UseCases } from "@/usecase";

import { ExitAllEntryUsersHandler } from "./exit-all-entry-users";

export interface ScheduledHandlers {
	exitAllEntryUsers: ExitAllEntryUsersHandler;
}

export function createScheduledHandlers(
	usecases: UseCases,
	services: Services,
): ScheduledHandlers {
	return {
		exitAllEntryUsers: new ExitAllEntryUsersHandler(
			usecases.exitAllEntryUsers,
			services.discord,
		),
	};
}
