import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ulid } from "ulidx";

export const users = sqliteTable("users", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => ulid()),
	discordId: text("discord_id").unique(),
	studentId: text("student_id").unique(),
});
