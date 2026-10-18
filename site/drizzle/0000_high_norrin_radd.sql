CREATE TABLE `creations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creation_owner_key` ON `creations` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`event` text NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`expires_at` integer NOT NULL,
	`cursor` integer NOT NULL
);
