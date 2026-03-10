import type { Database } from "@/database";
import type { AppLogger } from "@/logger";

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

export function createRepositories(
	db: Database,
	logger: AppLogger,
): Repositories {
	return {
		user: new DBUserRepository(db, logger.child({ tag: "user" })),
		studentCard: new DBStudentCardRepository(
			db,
			logger.child({ tag: "student-card" }),
		),
		nfcCard: new DBNfcCardRepository(db, logger.child({ tag: "nfc-card" })),
		unknownNfcCard: new DBUnknownNfcCardRepository(
			db,
			logger.child({ tag: "unknown-nfc-card" }),
		),
		roomEntryLog: new DBRoomEntryLogRepository(
			db,
			logger.child({ tag: "room-entry-log" }),
		),
	};
}
