CREATE TABLE `monthly_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_id` text NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`base_rent` real NOT NULL,
	`total_fees` real NOT NULL,
	`total_amount` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`address` text NOT NULL,
	`building_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rental_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_id` text NOT NULL,
	`fee_type` text NOT NULL,
	`amount` real NOT NULL,
	`valid_from_month` integer NOT NULL,
	`valid_from_year` integer NOT NULL,
	`valid_to_month` integer,
	`valid_to_year` integer,
	`is_variable` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`tenant_name` text NOT NULL,
	`tenant_document` text,
	`base_rent_amount` real NOT NULL,
	`move_in_date` integer NOT NULL,
	`due_date_day` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);