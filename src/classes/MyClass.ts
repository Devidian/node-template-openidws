import { NodeConfig } from "@/config";
import { WSAuthServer } from "./abstracts/WSAuthServer";
import { LiveStorage } from "./LiveStorage";

export class MyClass extends WSAuthServer<LiveStorage> {
	protected static highlander: MyClass = null;

	public static get NodeConfig(): NodeConfig {
		return WSAuthServer.NodeConfig;
	};

	/**
	 *
	 *
	 * @static
	 * @param {NodeConfig} [nc]
	 * @returns {MyClass}
	 * @memberof MyClass
	 */
	public static getInstance(nc?: NodeConfig): MyClass {
		WSAuthServer._NodeConfig = nc ? nc : WSAuthServer.NodeConfig;
		if (!MyClass.highlander) {
			MyClass.highlander = new MyClass();
		}
		return MyClass.highlander;
	}

	/**
	 * Creates an instance of MyClass.
	 * @memberof MyClass
	 */
	constructor() {
		super(new LiveStorage());
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof MyClass
	 */
	protected run(): void {
		// insert code here

		// run super to refresh timer
		super.run();
	}

}
