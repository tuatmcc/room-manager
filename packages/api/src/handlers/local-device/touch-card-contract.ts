import { z } from "zod";

export const TouchCardRequestSchema = z.object({
	idm: z.string(),
	student_id: z.number().optional(),
});

export const TouchCardResponseSchema = z.union([
	z.object({
		success: z.literal(true),
		status: z.union([z.literal("entry"), z.literal("exit")]),
		entries: z.number(),
	}),
	z.object({
		success: z.literal(false),
		error: z.string(),
		error_code: z.string(),
	}),
]);

export type TouchCardResponse = z.infer<typeof TouchCardResponseSchema>;
