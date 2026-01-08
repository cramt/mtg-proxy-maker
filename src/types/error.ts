export class CardError extends Error {
	constructor(
		public readonly cardName: string,
		message: string,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}
