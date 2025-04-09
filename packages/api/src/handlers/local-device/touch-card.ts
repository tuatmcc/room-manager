import type { Context } from "hono";
import { z } from "zod";

import type { Env } from "@/env";
import { ActionSchema } from "@/models/User";
import type { TouchStudentCardUseCase } from "@/usecase/TouchStudentCard";

import type { LocalDeviceHandler } from ".";

const TouchCardRequestSchema = z.object({
	studentId: z.string(),
});

// eslint-disable-next-line typescript/no-unused-vars
const TouchCardResponseSchema = z.union([
	z.object({
		success: z.literal(true),
		action: ActionSchema,
	}),
	z.object({
		success: z.literal(false),
		error: z.string(),
	}),
]);
type TouchCardResponse = z.infer<typeof TouchCardResponseSchema>;

export class TouchCardHandler implements LocalDeviceHandler {
	constructor(private readonly usecase: TouchStudentCardUseCase) {}

	async handle(c: Context<Env>): Promise<Response> {
		const request = TouchCardRequestSchema.safeParse(await c.req.json());
		if (!request.success) {
			return c.text("Invalid request", 400);
		}
		const { studentId } = request.data;

		const result = await this.usecase.execute(studentId);

		return result.match<Response>(
			(action) => c.json<TouchCardResponse>({ success: true, action }),
			(err) =>
				c.json<TouchCardResponse>({
					success: false,
					error: err.userMessage ?? "何かエラーが発生したようです。",
				}),
		);
	}
}
