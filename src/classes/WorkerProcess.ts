'use strict';
import { NodeConfig } from "../config";

/**
 *
 *
 * @export
 * @abstract
 * @class WorkerProcess
 * @extends {MongoApp}
 */
export abstract class WorkerProcess {
	protected abstract run(): void;
	public abstract destroy(): Promise<boolean>;
	public abstract updateConfig(nc: NodeConfig): void;
}