import { cfg, appArguments } from './config';
import WebSocket, {  } from "ws";
import { Logger } from './lib/tools/Logger';

const [command] = appArguments

if (cfg.cli.commands.indexOf(command) < 0) {
	Logger(511, "app-cli", 'illegal command, use one of these:', cfg.cli.commands);
	process.exit();
}

Logger(111, "app-cli", 'Starting IO Client for sending command <%s> to Master', command);

var IOClient: WebSocket = new WebSocket(`ws://localhost:${cfg.cli.port}/`);

IOClient.on('disconnect', function () {
	Logger(111, "app-cli", 'Disconnected, bye!');
	IOClient.removeAllListeners();
	process.exit(0);
});

interface CLIMessage {
	event: string,
	[key: string]: any
}

IOClient.on('connect', function () {
	Logger(111, "app-cli", 'Successful connected to Master');
	IOClient.send(command);
	IOClient.on('message', function (msg: CLIMessage) {
		Logger(11, "app-cli", `Master: ${msg}`);
		switch (msg.event) {
			case 'hello':

				break;
			case 'done':
				Logger(111, "app-cli", 'Done! Closeing connection to Master.');
				IOClient.close();
				break;
			default:
				break;
		}
		IOClient.close();
	});
});