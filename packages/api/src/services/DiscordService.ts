import type { KVNamespace } from "@cloudflare/workers-types";
import { calculateUserDefaultAvatarIndex, REST } from "@discordjs/rest";
import type {
	APIGuildMember,
	RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { Routes } from "discord-api-types/v10";

import type { AppLogger } from "@/logger";
import { serializeError } from "@/logger";

export class DiscordService {
	private readonly restClient: REST;

	constructor(
		private readonly cache: KVNamespace,
		botToken: string,
		private readonly guildId: string,
		private readonly channelId: string,
		private readonly logger: AppLogger,
	) {
		this.restClient = new REST({ version: "10" }).setToken(botToken);
	}

	async fetchUserInfo(
		userId: string,
	): Promise<{ iconUrl: string; name: string }> {
		const logger = this.logger.child({
			tag: "fetch-user-info",
			context: { userId },
		});
		const cacheKey = `discord:user:${userId}`;
		// キャッシュを確認
		const cached = await this.cache.get(cacheKey, { type: "json" });
		if (cached) {
			logger.debug("Discord user cache hit");
			return cached as { iconUrl: string; name: string };
		}

		logger.info("Fetching Discord user");
		try {
			const member = (await this.restClient.get(
				Routes.guildMember(this.guildId, userId),
			)) as APIGuildMember;

			const iconUrl = this.getAvatarUrl(member);
			const name =
				member.nick ?? member.user.global_name ?? member.user.username;

			const value = { iconUrl, name } as const;
			await this.cache.put(cacheKey, JSON.stringify(value), {
				expirationTtl: 60 * 60 * 12,
			});

			logger.info("Fetched Discord user");
			return value;
		} catch (error) {
			logger.error("Failed to fetch Discord user", serializeError(error));
			throw error;
		}
	}

	async sendMessage(message: RESTPostAPIChannelMessageJSONBody): Promise<void> {
		const logger = this.logger.child({
			tag: "send-message",
			context: {
				embedCount: message.embeds?.length ?? 0,
				hasContent: message.content != null,
			},
		});
		logger.info("Sending Discord message");
		try {
			await this.restClient.post(Routes.channelMessages(this.channelId), {
				body: message,
			});
			logger.info("Sent Discord message");
		} catch (error) {
			logger.error("Failed to send Discord message", serializeError(error));
			throw error;
		}
	}

	private getAvatarUrl(member: APIGuildMember): string {
		if (member.avatar != null) {
			return this.restClient.cdn.guildMemberAvatar(
				this.guildId,
				member.user.id,
				member.avatar,
				{ size: 512 },
			);
		}

		if (member.user.avatar != null) {
			return this.restClient.cdn.avatar(member.user.id, member.user.avatar, {
				size: 512,
			});
		}

		return this.restClient.cdn.defaultAvatar(
			calculateUserDefaultAvatarIndex(member.user.id),
		);
	}
}
