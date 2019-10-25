import { WorkerProcess } from './classes/WorkerProcess';
import { BaseConfig, cfg, NodeConfig, ocfg, processNodeId, processType } from './config';
import { Logger } from './lib/tools/Logger';
import { basename } from 'path';
import { MyClass } from './classes/MyClass';

const Config: NodeConfig = cfg.nodes[processType][processNodeId];
process.env.unit = processNodeId;

let Application: WorkerProcess = null as unknown as WorkerProcess;

const me: string = basename(__filename || "");

switch (processType) {
	case 'myclass':
		Application = MyClass.getInstance(Config);
		break;
	default:
		Logger(510, me, `Invalid module`);
		break;
}

ocfg.subscribe({
	next: (C: BaseConfig) => {
		Application.updateConfig(C.nodes[processType][processNodeId]);
	}
});

if (Application) {
	process.on('message', (msg: any) => {
		switch (msg) {
			case 'shutdown':
			case 'reboot':
				Application.destroy().then(() => {
					process.exit();
				});
				break;

			default:
				Logger(911, me, `Invalid message ${msg}`);
				break;
		}
	});
}