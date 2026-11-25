CREATE TABLE `chithis` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`generated_for` integer,
	`paper_style` text DEFAULT 'classic' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chithis_generated_for` ON `chithis` (`generated_for`);