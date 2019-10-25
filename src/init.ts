'use strict';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { accessSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { EOL } from 'os';
import { resolve } from 'path';
import { cfg, configType, rootDir } from './config';
import { Logger } from './lib/tools/Logger';

// Set process title
process.title = "Application initialisation";

Logger(111, "INIT", 'Initializing application!');

try {
	accessSync(resolve(rootDir, "config", configType + ".json"));
} catch (e) {
	Logger(911, "INIT", "Can't read config file", e.code, e.path);
	process.exit(1);
}

const logPath = resolve("/var", "log");
const servicePath = resolve("/usr", "lib", "systemd", "system");
const rsyslogPath = resolve("/etc", "rsyslog.d");

const SERVICE_NAME = cfg.app.service.name;
const SERVICE_ID = cfg.app.service.id;
const SERVICE_USER = cfg.app.service.user;
const SERVICE_ENV = cfg.app.service.env.length > 0 ? cfg.app.service.env.map(v => `Environment=${v}`).join(EOL) : "";
const SERVICE_AFTER = cfg.app.service.after.length > 0 ? `After=${cfg.app.service.after.join(" ")}` : "";
const SERVICE_DESC = cfg.app.service.desc || SERVICE_NAME + " Service Unit";

Logger(111, "INIT", 'Checking paths ...');
try {
	Logger(111, "INIT", '... log path');
	accessSync(logPath);
	Logger(111, "INIT", '... rsyslog path');
	accessSync(rsyslogPath);
	Logger(111, "INIT", '... systemd service path');
	mkdirSync(servicePath, { recursive: true }); // system directory may not be found on fresh installs, so we try to create
} catch (e) {
	Logger(911, "INIT", "Can't initialize paths, make sure to execute init as root", e.code, e.path);
	process.exit(1);
}

Logger(111, "INIT", `Checking user <${SERVICE_USER}>...`);
try {
	let output = execSync(`adduser --shell /bin/bash --disabled-password ${SERVICE_USER}`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
	Logger(111, "INIT", ' ... created!');
} catch (e) {
	if (e.status != 1) {
		Logger(911, "INIT", e);
		process.exit(1);
	} else {
		Logger(0, "INIT", '... already exists!');
	}
}


let serviceFile: string = "", rsyslogFile: string = "";
Logger(111, "INIT", 'Reading template files ...');
try {
	serviceFile = readFileSync(resolve(rootDir, "app.service"), { encoding: "UTF-8" });
	rsyslogFile = readFileSync(resolve(rootDir, "app.conf"), { encoding: "UTF-8" });
	Logger(111, "INIT", ' ... done!');
} catch (e) {
	Logger(911, "INIT", "Can't read app.service and app.conf file", e.code);
	process.exit(1);
}

Logger(111, "INIT", 'Creating rsyslog filter file ...');
try {
	const data = rsyslogFile.replace(/PH_SERVICE_ID/g, SERVICE_ID).replace(/PH_LOG_PATH/g, resolve(logPath, SERVICE_NAME + ".log"));
	writeFileSync(resolve(rsyslogPath, SERVICE_NAME + ".conf"), data);
} catch (e) {
	Logger(911, "INIT", "Can't save rsyslog file", e.code);
	process.exit(1);
}

Logger(111, "INIT", 'Creating service file ...');
try {
	const data = serviceFile
		.replace(/PH_SERVICE_ID/g, SERVICE_ID)
		.replace(/PH_SERVICE_DESC/g, SERVICE_DESC)
		.replace(/PH_SERVICE_USER/g, SERVICE_USER)
		.replace(/PH_SERVICE_ENV/g, SERVICE_ENV)
		.replace(/PH_SERVICE_AFTER/g, SERVICE_AFTER)
		.replace(/PH_WORKING_DIR/g, rootDir)
		.replace(/PH_CONFIG/g, configType);
	writeFileSync(resolve(servicePath, SERVICE_NAME + ".service"), data);
} catch (e) {
	Logger(911, "INIT", "Can't save service file", e.code);
	process.exit(1);
}

try {
	Logger(111, "INIT", 'Restarting rsyslog ...');
	let log = execSync("systemctl restart rsyslog.service", <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
	log += execSync(`systemctl daemon-reload`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
	log += execSync(`systemctl enable ${SERVICE_NAME}.service`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
	log += execSync(`systemctl start ${SERVICE_NAME}.service`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
} catch (e) {
	Logger(911, "INIT", "Can't restart service(s)", e);
	process.exit(1);
}

Logger(111, "INIT", `Done!`);
process.exit(0);