import { shun_shobon } from "@shun-shobon/style-guide/eslint";

export default shun_shobon(
	{},
	{
		files: ["**/*.ts"],
		rules: {
			"typescript/no-misused-promises": ["error", { checksVoidReturn: false }],
		},
	},
);
