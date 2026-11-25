import { SlashCommandBuilder } from "@discordjs/builders";

import { DISPLAY_MESSAGE_MAX_LENGTH } from "./services/DisplayMessageService";

export const pingCommand = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("pingをBotに送ります。");

export const roomCommand = new SlashCommandBuilder()
  .setName("room")
  .setDescription("入退出システムを操作します。")
  .addSubcommandGroup((group) =>
    group
      .setName("register")
      .setDescription("学生証またはNFCカードを登録します。")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("student-card")
          .setDescription("学生証を登録します。")
          .addIntegerOption((option) =>
            option
              .setName("id")
              .setNameLocalization("ja", "学籍番号")
              .setDescription("学籍番号")
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("nfc-card")
          .setDescription("NFCカードを登録します。")
          .addStringOption((option) =>
            option.setName("code").setDescription("NFCカードのコード").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("name").setDescription("NFCカードの名前(自由記述)").setRequired(true),
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("現在部室にいる人を表示します。"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("display")
      .setDescription("入室人数表示ページに出す文字列を登録します。省略すると消します。")
      .addStringOption((option) =>
        option
          .setName("message")
          .setNameLocalization("ja", "文字列")
          .setDescription("表示したい文字列")
          .setMaxLength(DISPLAY_MESSAGE_MAX_LENGTH),
      ),
  );

export const roomAdminCommand = new SlashCommandBuilder()
  .setName("room-admin")
  .setDescription("入退出システムの管理を行います。")
  .addSubcommandGroup((group) =>
    group
      .setName("setting")
      .setDescription("設定を操作します。設定値を省略すると現在の値を表示します。")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("register")
          .setDescription("新規登録の許可")
          .addBooleanOption((option) =>
            option
              .setName("allow")
              .setNameLocalization("ja", "許可")
              .setDescription("登録を許可するかどうか"),
          ),
      ),
  );
