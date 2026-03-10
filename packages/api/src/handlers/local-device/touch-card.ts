import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import type { Context } from "hono";

import type { AppEnv } from "@/env";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { DiscordService } from "@/services/DiscordService";
import type { TouchCardUseCase } from "@/usecase/TouchCard";

import { TouchCardRequestSchema, TouchCardResponseSchema } from "./touch-card-contract";
import type { TouchCardPresenter } from "./touch-card-presenter";

import type { LocalDeviceHandler } from ".";

export class TouchCardHandler implements LocalDeviceHandler {
  constructor(
    private readonly usecase: TouchCardUseCase,
    private readonly presenter: TouchCardPresenter,
    private readonly discordService: DiscordService,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(c: Context<AppEnv>): Promise<Response> {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      this.logger.warn("Failed to parse touch card request body", serializeError(error));
      return c.text("Invalid request", 400);
    }

    const request = TouchCardRequestSchema.safeParse(body);
    if (!request.success) {
      this.logger.warn("Touch card request validation failed", {
        issues: request.error.issues,
      });
      return c.text("Invalid request", 400);
    }

    const { idm, student_id: studentId } = request.data;
    this.logger.info("Handling touch card request", {
      idm,
      studentId,
    });
    const result = await this.usecase.execute({ idm, studentId });
    const presentation = await this.presenter.present(result);

    const message: RESTPostAPIChannelMessageJSONBody = {
      embeds: [presentation.embed],
    };
    await this.discordService.sendMessage(message);
    this.logger.info("Handled touch card request", {
      response: presentation.response,
    });

    return c.json(TouchCardResponseSchema.parse(presentation.response));
  }
}
