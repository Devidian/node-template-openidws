import { NodeConfig } from "../config";
import { WSAuthServer } from "./WSAuthServer";

export class MyClass extends WSAuthServer {
	protected static highlander: MyClass = null;

	public static get NodeConfig(): NodeConfig {
		return WSAuthServer.NodeConfig;
	};

	public static getInstance(nc?: NodeConfig): MyClass {
		WSAuthServer._NodeConfig = nc ? nc : WSAuthServer.NodeConfig;
		if (!MyClass.highlander) {
			MyClass.highlander = new MyClass();
		}
		return MyClass.highlander;
	}

	/**
	 *Creates an instance of MyClass.
	 * @memberof MyClass
	 */
	constructor() {
		super();
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof MyClass
	 */
	protected run(): void {
		// inser code here

		// run super to refresh timer
		super.run();
	}

}