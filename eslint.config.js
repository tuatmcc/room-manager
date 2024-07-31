import { shun_shobon } from "@shun-shobon/eslint-config";

export default shun_shobon(
	{},
	{
		files: ["**/*.ts"],
		rules: {
			"typescript/no-misused-promises": ["error", { checksVoidReturn: false }],
		},
	},
);
