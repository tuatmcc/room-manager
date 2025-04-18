import type { Context } from "hono";
import { z } from "zod";

import type { Env } from "@/env";
import type { DiscordService } from "@/services/DiscordService";
import type { TouchStudentCardUseCase } from "@/usecase/TouchStudentCard";

import type { LocalDeviceHandler } from ".";

const TouchCardRequestSchema = z.object({
	studentId: z.number(),
});

// eslint-disable-next-line typescript/no-unused-vars
const TouchCardResponseSchema = z.union([
	z.object({
		success: z.literal(true),
		status: z.union([z.literal("entry"), z.literal("exit")]),
	}),
	z.object({
		success: z.literal(false),
		error: z.string(),
	}),
]);
type TouchCardResponse = z.infer<typeof TouchCardResponseSchema>;

export class TouchCardHandler implements LocalDeviceHandler {
	constructor(
		private readonly usecase: TouchStudentCardUseCase,
		private readonly service: DiscordService,
	) {}

	async handle(c: Context<Env>): Promise<Response> {
		const request = TouchCardRequestSchema.safeParse(await c.req.json());
		if (!request.success) {
			return c.text("Invalid request", 400);
		}
		const { studentId } = request.data;

		const result = await this.usecase.execute(studentId);

		return await result.match<Promise<Response>>(
			async (res) => {
				await this.service.sendMessage(res.message);
				return c.json<TouchCardResponse>({ success: true, status: res.status });
			},
			async (err) =>
				await Promise.resolve(
					c.json<TouchCardResponse>({
						success: false,
						error: err.message,
					}),
				),
		);
	}
}
