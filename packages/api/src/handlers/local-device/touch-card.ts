import { Temporal } from "@js-temporal/polyfill";
import type {
	APIEmbed,
	RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { Context } from "hono";
import { z } from "zod";

import { colorToHex } from "@/discord";
import type { AppEnv, Env } from "@/env";
import type { DiscordService } from "@/services/DiscordService";
import type {
	TouchCardError,
	TouchCardResult,
	TouchCardUseCase,
} from "@/usecase/TouchCard";

import type { LocalDeviceHandler } from ".";

const TouchCardRequestSchema = z.object({
	idm: z.string(),
	student_id: z.number().optional(),
});

const TouchCardResponseSchema = z.union([
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
type TouchCardResponse = z.infer<typeof TouchCardResponseSchema>;

export class TouchCardHandler implements LocalDeviceHandler {
	constructor(
		private readonly usecase: TouchCardUseCase,
		private readonly discordService: DiscordService,
		private readonly env: Env,
	) {}

	async handle(c: Context<AppEnv>): Promise<Response> {
		const request = TouchCardRequestSchema.safeParse(await c.req.json());
		if (!request.success) {
			return c.text("Invalid request", 400);
		}

		const { idm, student_id: studentId } = request.data;
		const result = await this.usecase.execute({ idm, studentId });

		const { embed, response } = await result.match<
			| Promise<{ embed: APIEmbed; response: TouchCardResponse }>
			| { embed: APIEmbed; response: TouchCardResponse }
		>(
			async (res) => {
				return await this.handleSuccess(res);
			},
			(err) => {
				return this.handleError(err);
			},
		);

		const message: RESTPostAPIChannelMessageJSONBody = {
			embeds: [embed],
		};
		await this.discordService.sendMessage(message);
		return c.json(TouchCardResponseSchema.parse(response));
	}

	private async handleSuccess(
		result: TouchCardResult,
	): Promise<{ embed: APIEmbed; response: TouchCardResponse }> {
		const userInfo = await this.discordService.fetchUserInfo(
			result.user.discordId,
		);

		const memberCount =
			result.entries === 0
				? "部室には誰も居ません"
				: `${result.entries}人が入室中です`;

		const nowEpochSeconds = Math.floor(
			Temporal.Now.instant().epochMilliseconds / 1000,
		);
		const timestamp = `<t:${nowEpochSeconds}:R>`;

		const description = [memberCount, timestamp].join("\n\n");

		const embed: APIEmbed = {
			author: {
				name: "入退出通知",
			},
			title: `${userInfo.name}さんが${result.status === "entry" ? "入室" : "退出"}しました`,
			description,
			thumbnail: {
				url: userInfo.iconUrl,
			},
			color: colorToHex(result.status === "entry" ? "green" : "red"),
		};

		return {
			embed,
			response: {
				success: true,
				status: result.status,
				entries: result.entries,
			},
		};
	}

	private handleError(error: TouchCardError): {
		embed: APIEmbed;
		response: TouchCardResponse;
	} {
		const embed: APIEmbed = (() => {
			switch (error.meta.code) {
				case "STUDENT_CARD_NOT_REGISTERED":
					return {
						title: "登録されていない学生証です",
						description: `</room register student-card:${this.env.DISCORD_ROOM_COMMAND_ID}>で学生証を登録してください。`,
						color: colorToHex("red"),
					};
				case "NFC_CARD_NOT_REGISTERED":
					return {
						title: "登録されていないNFCカードです",
						description: `</room register nfc-card ${error.meta.unknownNfcCard.code}:${this.env.DISCORD_ROOM_COMMAND_ID}>でNFCカードを登録してください。`,
						color: colorToHex("red"),
					};
				case "UNKNOWN":
					return {
						title: "エラーが発生しました",
						description: "エラーが発生しました。管理者に連絡してください。",
						color: colorToHex("red"),
					};
			}
		})();

		return {
			embed,
			response: {
				success: false,
				error: error.message,
				error_code: error.meta.code,
			},
		};
	}
}
