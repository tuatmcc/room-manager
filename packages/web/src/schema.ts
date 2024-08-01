import { Temporal } from "@js-temporal/polyfill";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	// primary key
	id: text("id").notNull().primaryKey(),

	// columns
	discordId: text("discord_id").notNull().unique(),
	studentId: text("student_id").notNull().unique(),
	isInRoom: integer("is_in_room", { mode: "boolean" }).notNull(),

	// timestamps
	createdAt: integer("created_at")
		.notNull()
		.$defaultFn(() => Temporal.Now.instant().epochMilliseconds),
	updatedAt: integer("updated_at")
		.notNull()
		.$defaultFn(() => Temporal.Now.instant().epochMilliseconds)
		.$onUpdateFn(() => Temporal.Now.instant().epochMilliseconds),
});
