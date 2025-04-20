import type { Context } from "hono";
import { z } from "zod";

import type { Env } from "@/env";
import type { DiscordService } from "@/services/DiscordService";
import type { TouchStudentCardUseCase } from "@/usecase/TouchCard";

import type { LocalDeviceHandler } from ".";

const TouchCardRequestSchema = z.object({
	student_id: z.number().optional(),
	suica_idm: z.string().optional(),
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
		error_code: z.string(),
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

		const { student_id: studentId, suica_idm: suicaIdm } = request.data;
		const result = await this.usecase.execute({ studentId, suicaIdm });

		return await result.match<Promise<Response>>(
			async (res) => {
				await this.service.sendMessage(res.message);
				return c.json<TouchCardResponse>({ success: true, status: res.status });
			},
			async (err) => {
				await this.service.sendMessage(err.userMessage, "error");
				return c.json<TouchCardResponse>({
					success: false,
					error: err.message,
					error_code: err.errorCode,
				});
			},
		);
	}
}
