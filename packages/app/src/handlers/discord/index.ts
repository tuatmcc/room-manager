import type { ChatInputCommandInteraction } from "discord.js";

import { ping } from "./ping";

export type CommandHandler = (
	interaction: ChatInputCommandInteraction,
) => Promise<void>;

export const handlers = new Map<string, CommandHandler>([["ping", ping]]);
