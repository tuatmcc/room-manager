import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import type { Context } from "hono";

import type { AppEnv } from "@/env";
import type { DiscordService } from "@/services/DiscordService";
import type { TouchCardUseCase } from "@/usecase/TouchCard";

import type { LocalDeviceHandler } from ".";
import {
	TouchCardRequestSchema,
	TouchCardResponseSchema,
} from "./touch-card-contract";
import type { TouchCardPresenter } from "./touch-card-presenter";

export class TouchCardHandler implements LocalDeviceHandler {
	constructor(
		private readonly usecase: TouchCardUseCase,
		private readonly presenter: TouchCardPresenter,
		private readonly discordService: DiscordService,
	) {}

	async handle(c: Context<AppEnv>): Promise<Response> {
		const request = TouchCardRequestSchema.safeParse(await c.req.json());
		if (!request.success) {
			return c.text("Invalid request", 400);
		}

		const { idm, student_id: studentId } = request.data;
		const result = await this.usecase.execute({ idm, studentId });
		const presentation = await this.presenter.present(result);

		const message: RESTPostAPIChannelMessageJSONBody = {
			embeds: [presentation.embed],
		};
		await this.discordService.sendMessage(message);

		return c.json(TouchCardResponseSchema.parse(presentation.response));
	}
}
