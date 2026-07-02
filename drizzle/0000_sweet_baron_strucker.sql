CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `comparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`pay_period_start` text NOT NULL,
	`pay_period_end` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`setup_complete` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`sort_preference` text DEFAULT 'last_name' NOT NULL,
	`expected_employee_count` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comparison_id` integer NOT NULL,
	`type` text NOT NULL,
	`file_name` text NOT NULL,
	`uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
	`headers` text NOT NULL,
	`rows` text NOT NULL,
	`row_count` integer NOT NULL,
	`detected_types` text DEFAULT '{}' NOT NULL,
	`column_sections` text DEFAULT '{}' NOT NULL,
	`legacy_provider` text,
	`format_notes` text,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_comparison_type_unique` ON `sources` (`comparison_id`,`type`);--> statement-breakpoint
CREATE TABLE `employee_mapping` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comparison_id` integer NOT NULL,
	`legacy_employee_key` text NOT NULL,
	`new_employee_key` text NOT NULL,
	`employee_match_mode` text DEFAULT 'exact' NOT NULL,
	`new_first_name_column` text,
	`new_last_name_column` text,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_mapping_comparison_id_unique` ON `employee_mapping` (`comparison_id`);--> statement-breakpoint
CREATE TABLE `employee_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` integer NOT NULL,
	`legacy_key` text,
	`new_key` text,
	`employee_name` text,
	`resolved` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "employee_pairings_not_null_null" CHECK("employee_pairings"."legacy_key" IS NOT NULL OR "employee_pairings"."new_key" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_pairings_legacy_unique` ON `employee_pairings` (`comparison_id`,`legacy_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_pairings_new_unique` ON `employee_pairings` (`comparison_id`,`new_key`);--> statement-breakpoint
CREATE TABLE `column_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` integer NOT NULL,
	`category` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`tolerance` real DEFAULT 0.01 NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `column_pairing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`column_mapping_id` text NOT NULL,
	`comparison_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`column_name` text NOT NULL,
	FOREIGN KEY (`column_mapping_id`) REFERENCES `column_mapping`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `column_pairing_unique` ON `column_pairing` (`comparison_id`,`source_type`,`column_name`);--> statement-breakpoint
CREATE TABLE `mapping_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comparison_id` integer NOT NULL,
	`employee_pairing_id` text NOT NULL,
	`column_mapping_id` text NOT NULL,
	`legacy_value` real DEFAULT 0 NOT NULL,
	`legacy_breakdown` text,
	`new_value` real DEFAULT 0 NOT NULL,
	`new_breakdown` text,
	`difference` real DEFAULT 0 NOT NULL,
	`auto_status` text NOT NULL,
	`manual_override` text,
	`note` text,
	`employee_name` text,
	`employee_first_name` text,
	`employee_last_name` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_pairing_id`) REFERENCES `employee_pairings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_mapping_id`) REFERENCES `column_mapping`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_entries_unique` ON `mapping_entries` (`comparison_id`,`employee_pairing_id`,`column_mapping_id`);--> statement-breakpoint
CREATE TABLE `collaborator` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comparison_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`access` text DEFAULT 'viewer' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collaborator_one_owner_per_comparison` ON `collaborator` (`comparison_id`) WHERE "collaborator"."access" = 'owner';--> statement-breakpoint
CREATE UNIQUE INDEX `collaborator_unique_user_per_comparison` ON `collaborator` (`comparison_id`,`user_id`);