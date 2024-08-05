export class AppError extends Error {
	static {
		this.prototype.name = "AppError";
	}
}
