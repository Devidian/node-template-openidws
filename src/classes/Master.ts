'use strict';
import { fork as forkChild, setupMaster, Worker as clusterWorker } from 'cluster';
import { existsSync, watch as watchFS } from 'fs';
import { basename, resolve } from 'path';
import { BehaviorSubject } from 'rxjs';
import { Server } from "ws";
import { app, cfg, configType, NodeConfig, ocfg, rootDir } from '../config';
import { Logger } from '../lib/tools/Logger';

/**
 *
 *
 * @export
 * @class Master
 */
export class Master {

	// io stuff
	protected wsServer: Server = null as unknown as Server;

	// protected workerList: Map<string, ChildProcess> = new Map<string, ChildProcess>();
	protected nodeList: Map<string, Map<string, clusterWorker>> = new Map<string, Map<string, clusterWorker>>();

	protected flagReboot: boolean = false;
	protected flagWatchFile: Map<string, boolean> = new Map<string, boolean>();

	private get me(): string {
		return basename(__filename);
	}

	/**
	 * counts all active nodes
	 *
	 * @protected
	 * @returns {number}
	 * @memberof Master
	 */
	protected get activeNodes(): number {
		let count = 0;

		this.nodeList.forEach(NodeMap => {
			count += NodeMap.size;
		});

		return count;
	}

	/**
	 *
	 *
	 * @readonly
	 * @protected
	 * @type {string[]}
	 * @memberof Master
	 */
	protected get availableNodeTypes(): string[] {
		return Object.keys(cfg.nodes);
	}

	/**
	 * Creates an instance of Master.
	 * @memberof Master
	 */
	constructor() {
		const lockFilePath = resolve(rootDir, "upgrade.lock");

		watchFS(__dirname, (e: string, f: string) => {
			if (f) {
				let parts = f.split('.');
				let name = (parts.shift() as string).toLowerCase();

				if (!existsSync(lockFilePath) && this.nodeList.has(name) && (!this.flagWatchFile.has(name) || !this.flagWatchFile.get(name))) {
					Logger(20, this.me, '[Master]', '[watchFS]', `restarting worker ${name} due to file changes on ${f}`);
					this.nodeList.get(name).forEach(N => N.send("reboot"));
					this.flagWatchFile.set(name, true);
				}
			}
		});

		ocfg.subscribe({
			next: (cfgUpdate) => {
				if (existsSync(lockFilePath)) return;
				Logger(20, this.me, '[Master]', '[ObservableConfig]', `config changed (re)booting worker`);

				this.availableNodeTypes.forEach(type => {
					Promise.all(this.bootWorker(type)).catch(e => Logger(911, "Master", e));
				});
			},
			error: (err) => {
				Logger(911, "Master", err);
			}
		});

		this.availableNodeTypes.forEach(type => {
			Promise.all(this.bootWorker(type)).catch(e => Logger(911, "Master", e));
		});
	}


	/**
	 *
	 *
	 * @protected
	 * @param {string} type
	 * @returns {Promise<ChildProcess|clusterWorker>[]}
	 * @memberof Master
	 */
	protected bootWorker(type: string): Promise<clusterWorker>[] {

		const createdWorker: Promise<clusterWorker>[] = [];

		for (const nodeId in cfg.nodes[type]) {
			const workerMap = this.nodeList.has(type) ? this.nodeList.get(type) : new Map<string, clusterWorker>();
			this.nodeList.set(type, workerMap);
			if (cfg.nodes[type].hasOwnProperty(nodeId)) {
				const nc: NodeConfig = cfg.nodes[type][nodeId];
				if (!nc.enabled && workerMap.has(nodeId)) {
					// Worker up but should be off
					workerMap.get(nodeId).send("shutdown");
				} else if (!workerMap.has(nodeId) && nc.enabled) {
					let W: clusterWorker = null;

					setupMaster({
						exec: app + "/../worker.js",
						args: [configType, type, nodeId]
					});
					W = forkChild();

					workerMap.set(nodeId, W);
					W.on("exit", (c: number, s: string) => {
						if (this.nodeList.has(type)) {
							this.nodeList.get(type).get(nodeId).removeAllListeners();
							this.nodeList.get(type).delete(nodeId);
							this.flagWatchFile.set(type, false);
						}
						if (this.flagReboot) {
							Logger(120, this.me, '[Master]', `Worker[${W.id}/${type}]: exited (reboot)`);

							if (this.activeNodes < 1) {
								Logger(120, this.me, '[Master]', `All worker shut down, exit now for reboot`);
								this.cleanExit();
							}
						} else {
							Logger(520, this.me, '[Master]', `Worker[${W.id}/${type}]: exited`);
							Promise.all(this.bootWorker(type)).catch(e => Logger(911, "Master", e));
						}
					});

					W.on("close", (c: number, s: string) => {
						Logger(520, this.me, '[Master]', `Worker[${W.id}/${type}]: closed`);
					}).on("disconnect", () => {
						Logger(520, this.me, '[Master]', `Worker[${W.id}/${type}]: disconnected`);
					}).on("error", (e: Error) => {
						Logger(520, this.me, '[Master]', `Worker[${W.id}/${type}]: error ${e.toString()}`);
					}).on("message", (msg: any) => {
						if (msg.type == "reboot") {
							this.flagReboot = true;
							this.nodeList.forEach(N => N.forEach(CP => {
								CP.send("reboot");
							}));
						} else {
							Logger(20, this.me, '[Master]', `Worker[${W.id}/${type}]: ${msg.type}`);
						}
					});

					createdWorker.push(Promise.resolve(W));
				}
			}
		}

		return createdWorker;
	}

	/**
	 * WebSocketServer for CLI connection
	 *
	 * @protected
	 * @memberof Master
	 */
	protected setupWSServer() {
		Logger(110, this.me, `Starting CLI WebSocket server on port ${cfg.cli.port}`);
		this.wsServer = new Server({ port: cfg.cli.port });


		// Command Line Interface
		this.wsServer.on('connection', (ws, req) => {
			Logger(110, this.me, `CLI connected from ${req.connection.remoteAddress}`);
			// ws.send(JSON.stringify({ event: 'hello', content: 'Welcome to Master cli' }));
			ws.on("message", (message: string) => {
				const [command, options] = JSON.parse(message);
				let done = new BehaviorSubject<boolean>(false);
				switch (command) {
					case "reboot":
						this.flagReboot = true;
						this.nodeList.forEach(N => N.forEach(CP => {
							CP.send("reboot");
						}));
						done.next(true);
						break;
					default:
						Logger(911, this.me, 'CLI', `Unknown command ${command}`);
						break;
				}
				done.subscribe({
					next: (val) => {
						!val ? null : ws.send(JSON.stringify({ event: 'done' }));
					}
				});
			});
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof Master
	 */
	protected cleanExit(): void {
		process.exit(0);
	}
}