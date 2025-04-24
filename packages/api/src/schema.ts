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
			.references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),

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

export const nfcCards = sqliteTable(
	"nfc_cards",
	{
		// primary key
		id: integer("id").primaryKey({ autoIncrement: true }),

		// columns
		idm: text("idm").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),

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
		index("idx_nfc_cards_idm").on(table.idm),
	],
);

export const nfcCardsRelations = relations(nfcCards, ({ one }) => ({
	user: one(users, {
		fields: [nfcCards.userId],
		references: [users.id],
	}),
}));

export const roomEntryLogs = sqliteTable(
	"room_entry_logs",
	{
		// primary key
		id: integer("id").primaryKey({ autoIncrement: true }),

		// columns
		entryAt: integer("entry_at").notNull(),
		exitAt: integer("exit_at"),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),

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
