import type { KVNamespace } from "@cloudflare/workers-types";
import { calculateUserDefaultAvatarIndex, REST } from "@discordjs/rest";
import type {
	APIGuildMember,
	RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { Routes } from "discord-api-types/v10";

import { convertMessageToEmbed } from "@/discord";
import type { Message } from "@/message";

export class DiscordService {
	private readonly restClient: REST;

	constructor(
		private readonly cache: KVNamespace,
		botToken: string,
		private readonly guildId: string,
		private readonly channelId: string,
	) {
		this.restClient = new REST({ version: "10" }).setToken(botToken);
	}

	async fetchUserInfo(
		userId: string,
	): Promise<{ iconUrl: string; name: string }> {
		const cacheKey = `discord:${userId}`;
		// キャッシュを確認
		const cached = await this.cache.get(cacheKey, { type: "json" });
		if (cached) {
			return cached as { iconUrl: string; name: string };
		}

		const member = (await this.restClient.get(
			Routes.guildMember(this.guildId, userId),
		)) as APIGuildMember;

		const iconUrl = this.getAvatarUrl(member);
		const name = member.nick ?? member.user.global_name ?? member.user.username;

		const value = { iconUrl, name } as const;
		// 12時間（43200秒）でキャッシュ
		await this.cache.put(cacheKey, JSON.stringify(value), {
			expirationTtl: 60 * 60 * 12,
		});

		return value;
	}

	async sendMessage(message: Message, type?: "error"): Promise<void> {
		const body: RESTPostAPIChannelMessageJSONBody = {
			embeds: [convertMessageToEmbed(message, type)],
		};

		await this.restClient.post(Routes.channelMessages(this.channelId), {
			body,
		});
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
