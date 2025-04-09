import { z } from "zod";

export class User {
	constructor(
		public readonly id: number,
		public readonly discordId: string,
	) {}
}

export const ActionSchema = z.enum(["entered", "exited"]);
export type Action = z.infer<typeof ActionSchema>;
