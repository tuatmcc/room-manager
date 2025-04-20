import type { Database } from "@/database";

import { RoomEntryLogRepository } from "./RoomEntryLogRepository";
import { StudentCardRepository } from "./StudentCardRepository";
import { SuicaCardRepository } from "./SuicaCardRepository";
import { UserRepository } from "./UserRepository";

export interface Repositories {
	user: UserRepository;
	studentCard: StudentCardRepository;
	suicaCard: SuicaCardRepository;
	roomEntryLog: RoomEntryLogRepository;
}

export function createRepositories(db: Database): Repositories {
	return {
		user: new UserRepository(db),
		studentCard: new StudentCardRepository(db),
		suicaCard: new SuicaCardRepository(db),
		roomEntryLog: new RoomEntryLogRepository(db),
	};
}
