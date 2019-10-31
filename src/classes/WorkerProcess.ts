'use strict';
import { worker as MyProcess } from "cluster";
import { cfg, NodeConfig } from "../config";

/**
 *
 *
 * @export
 * @abstract
 * @class WorkerProcess
 * @extends {MongoApp}
 */
export abstract class WorkerProcess {
	protected static _NodeConfig: NodeConfig = null;
	protected timer: NodeJS.Timer = null;
	protected run(): void {
		process.title = cfg.app.title + "@W" + MyProcess.id;
		this.timer.refresh();
	}
	public abstract destroy(): Promise<boolean>;
	public abstract updateConfig(nc: NodeConfig): void;
}