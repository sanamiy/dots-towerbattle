ALTER TABLE `rooms` ADD `invite_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `room_invite_hash` ON `rooms` (`invite_hash`);