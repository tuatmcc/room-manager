import type { Database } from "@/database";

import type { NfcCardRepository } from "./NfcCardRepository";
import { DBNfcCardRepository } from "./NfcCardRepository";
import type { RoomEntryLogRepository } from "./RoomEntryLogRepository";
import { DBRoomEntryLogRepository } from "./RoomEntryLogRepository";
import type { StudentCardRepository } from "./StudentCardRepository";
import { DBStudentCardRepository } from "./StudentCardRepository";
import type { UnknownNfcCardRepository } from "./UnknownNfcCardRepository";
import { DBUnknownNfcCardRepository } from "./UnknownNfcCardRepository";
import type { UserRepository } from "./UserRepository";
import { DBUserRepository } from "./UserRepository";

export interface Repositories {
	user: UserRepository;
	studentCard: StudentCardRepository;
	nfcCard: NfcCardRepository;
	unknownNfcCard: UnknownNfcCardRepository;
	roomEntryLog: RoomEntryLogRepository;
}

export function createRepositories(db: Database): Repositories {
	return {
		user: new DBUserRepository(db),
		studentCard: new DBStudentCardRepository(db),
		nfcCard: new DBNfcCardRepository(db),
		unknownNfcCard: new DBUnknownNfcCardRepository(db),
		roomEntryLog: new DBRoomEntryLogRepository(db),
	};
}
