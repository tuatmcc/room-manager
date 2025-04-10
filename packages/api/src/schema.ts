import { Temporal } from "@js-temporal/polyfill";
import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	// primary key
	id: integer("id").primaryKey({ autoIncrement: true }),

	// columns
	discordId: text("discord_id").notNull().unique(),

	// timestamps
	createdAt: integer("created_at")
		.notNull()
		.$defaultFn(() => Temporal.Now.instant().epochMilliseconds),
	updatedAt: integer("updated_at")
		.notNull()
		.$defaultFn(() => Temporal.Now.instant().epochMilliseconds)
		.$onUpdateFn(() => Temporal.Now.instant().epochMilliseconds),
});

export const studentCards = sqliteTable(
	"student_cards",
	{
		// primary key
		id: integer("id").primaryKey({ autoIncrement: true }),

		// columns
		studentId: integer("student_id").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.unique()
			.references(() => users.id),

		// timestamps
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds)
			.$onUpdateFn(() => Temporal.Now.instant().epochMilliseconds),
	},
	(table) => [
		// indexes
		index("idx_student_cards_student_id").on(table.studentId),
	],
);

export const studentCardsRelations = relations(studentCards, ({ one }) => ({
	user: one(users, {
		fields: [studentCards.userId],
		references: [users.id],
	}),
}));

export const suicaCards = sqliteTable(
	"suica_cards",
	{
		// primary key
		id: integer("id").primaryKey({ autoIncrement: true }),

		// columns
		card_idm: text("card_idm").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.unique()
			.references(() => users.id),

		// timestamps
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds)
			.$onUpdateFn(() => Temporal.Now.instant().epochMilliseconds),
	},
	(table) => [
		// indexes
		index("idx_suica_cards_card_idm").on(table.card_idm),
	],
);

export const suicaCardsRelations = relations(suicaCards, ({ one }) => ({
	user: one(users, {
		fields: [suicaCards.userId],
		references: [users.id],
	}),
}));

export const roomEntryLogs = sqliteTable(
	"room_entry_logs",
	{
		// primary key
		id: integer("id").primaryKey({ autoIncrement: true }),

		// columns
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),

		entryAt: integer("entry_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds),
		exitAt: integer("exit_at"),

		// timestamps
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Temporal.Now.instant().epochMilliseconds)
			.$onUpdateFn(() => Temporal.Now.instant().epochMilliseconds),
	},
	(table) => [
		// indexes
		index("idx_room_entry_logs_user_id").on(table.userId),
		index("idx_room_entry_logs_entry_at").on(table.entryAt),
		index("idx_room_entry_logs_exit_at").on(table.exitAt),
	],
);

export const roomEntryLogsRelations = relations(roomEntryLogs, ({ one }) => ({
	user: one(users, {
		fields: [roomEntryLogs.userId],
		references: [users.id],
	}),
}));
