import { NodeConfig, cfg } from "../config";
import { WorkerProcess } from "./WorkerProcess";
import { worker as MyProcess } from "cluster";

export class MyClass extends WorkerProcess {
	// public static VERSION: string = "0.7.4";
	private static _NodeConfig: NodeConfig = null;
	protected static highlander: MyClass = null;

	public static get NodeConfig(): NodeConfig {
		return MyClass._NodeConfig;
	};

	public static getInstance(nc?: NodeConfig): MyClass {
		MyClass._NodeConfig = nc ? nc : MyClass.NodeConfig;
		if (!MyClass.highlander) {
			MyClass.highlander = new MyClass();
		}
		return MyClass.highlander;
	}

	protected timer: NodeJS.Timer = null;

	/**
	 *Creates an instance of MyClass.
	 * @memberof MyClass
	 */
	constructor() {
		super();
		this.timer = setTimeout(_ => { this.run(); }, 200);
	}

	/**
	 *
	 *
	 * @param {NodeConfig} nc
	 * @memberof MyClass
	 */
	public updateConfig(nc: NodeConfig): void {
		Object.assign(MyClass._NodeConfig, nc);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof MyClass
	 */
	protected run(): void {
		process.title = cfg.app.title + "@W" + MyProcess.id;
		this.timer.refresh();
	}

	/**
	 *
	 *
	 * @param {(string | number | Error)} [signal]
	 * @returns {Promise<boolean>}
	 * @memberof MyClass
	 */
	public async destroy(signal?: string | number | Error): Promise<boolean> {

		return true;
	}

}