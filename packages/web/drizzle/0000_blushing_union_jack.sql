CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text,
	`student_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_student_id_unique` ON `users` (`student_id`);