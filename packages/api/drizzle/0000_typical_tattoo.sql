CREATE TABLE `nfc_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`idm` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nfc_cards_idm_unique` ON `nfc_cards` (`idm`);--> statement-breakpoint
CREATE UNIQUE INDEX `nfc_cards_user_id_unique` ON `nfc_cards` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_nfc_cards_idm` ON `nfc_cards` (`idm`);--> statement-breakpoint
CREATE TABLE `room_entry_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_at` integer NOT NULL,
	`exit_at` integer,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_room_entry_logs_user_id` ON `room_entry_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_room_entry_logs_entry_at` ON `room_entry_logs` (`entry_at`);--> statement-breakpoint
CREATE INDEX `idx_room_entry_logs_exit_at` ON `room_entry_logs` (`exit_at`);--> statement-breakpoint
CREATE TABLE `student_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_cards_student_id_unique` ON `student_cards` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_cards_user_id_unique` ON `student_cards` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_student_cards_student_id` ON `student_cards` (`student_id`);--> statement-breakpoint
CREATE TABLE `unknown_nfc_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`idm` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unknown_nfc_cards_code_unique` ON `unknown_nfc_cards` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `unknown_nfc_cards_idm_unique` ON `unknown_nfc_cards` (`idm`);--> statement-breakpoint
CREATE INDEX `idx_unknown_nfc_cards_idm` ON `unknown_nfc_cards` (`idm`);--> statement-breakpoint
CREATE INDEX `idx_unknown_nfc_cards_code` ON `unknown_nfc_cards` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);