import type { Database } from "@/database";

import { NfcCardRepository } from "./NfcCardRepository";
import { RoomEntryLogRepository } from "./RoomEntryLogRepository";
import { StudentCardRepository } from "./StudentCardRepository";
import { UserRepository } from "./UserRepository";

export interface Repositories {
	user: UserRepository;
	studentCard: StudentCardRepository;
	nfcCard: NfcCardRepository;
	roomEntryLog: RoomEntryLogRepository;
}

export function createRepositories(db: Database): Repositories {
	return {
		user: new UserRepository(db),
		studentCard: new StudentCardRepository(db),
		nfcCard: new NfcCardRepository(db),
		roomEntryLog: new RoomEntryLogRepository(db),
	};
}
