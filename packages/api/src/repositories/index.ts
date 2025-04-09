import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "@/schema";

import { StudentCardRepository } from "./StudentCardRepository";
import { UserRepository } from "./UserRepository";

export interface Repositories {
	user: UserRepository;
	studentCard: StudentCardRepository;
}

export function createRepositories(
	db: DrizzleD1Database<typeof schema>,
): Repositories {
	return {
		user: new UserRepository(db),
		studentCard: new StudentCardRepository(db),
	};
}
