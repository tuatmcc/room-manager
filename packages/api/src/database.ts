import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "@/schema";

export type Database = DrizzleD1Database<typeof schema>;

export function createDatabase(db: D1Database): Database {
	return drizzle(db, { schema });
}
