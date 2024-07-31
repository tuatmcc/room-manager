import type { CommandHandler } from ".";

export const ping: CommandHandler = async (interaction) => {
	const diff = Date.now() - interaction.createdTimestamp;

	await interaction.reply({
		content: `Pong! \`${diff}ms\``,
	});
};
