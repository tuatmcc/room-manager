import { describe, expect, it } from "vitest";

function sum(a: number, b: number): number {
	return a + b;
}

describe("sum", () => {
	it("should sum two numbers", () => {
		expect(sum(1, 2)).toBe(3);
	});
});
