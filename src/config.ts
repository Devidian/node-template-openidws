import { resolve } from "path";
import { BehaviorSubject } from "rxjs";
import { Config } from "./lib/models/Config";
import { ConfigLoader } from "./lib/tools/ConfigLoader";

export interface NodeConfig {
	enabled: boolean,		        // if false this node wont boot
	tick: number,                   // run loop timeout
	www: {
		port: number,
	},
	ws: {
		port: number,
		host: string,
		cookieDomain: string
	},
	openid: {
		google?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[]
		},
		microsoft?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[],
		},
		twitch?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[],
		},
		paypal?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[],
		},
		salesforce?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[],
		},
		yahoo?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[],
		},
		phantauth?: {
			discover_url: string,
			client_id: string,
			client_secret: string,
			redirect_uris: string[],
		},
		// non connect standard
		facebook?: {
			basic_url: string,
			params: {
				client_id: string,
				redirect_uri: string,
				state: string
			},
			client_secret: string,
		},
		steam?: {
			basic_url: string,
			params: {
				"openid.ns": string,
				"openid.mode": string,
				"openid.return_to": string,
				"openid.realm": string,
				"openid.identity": string,
				"openid.claimed_id": string,
			},
			api_key: string,
		}
	},
	[key: string]: any              // other settings
}

export interface NodeList {
	[id: string]: NodeConfig
}

export interface BaseConfig extends Config {
	nodes: { [key: string]: NodeList },
	cli: {
		port: number,
		commands: string[]
	}
}

export const [cwd, app, configType, ...appArguments] = process.argv;
export const [processType, processNodeId] = appArguments;

const C = ConfigLoader.getInstance<BaseConfig>(resolve(process.cwd(), "config"), configType || "config");

export var ocfg: BehaviorSubject<BaseConfig> = new BehaviorSubject<BaseConfig>(C.cfg);
C.on("update", (C: BaseConfig) => ocfg.next(C));

export var cfg: BaseConfig = C.cfg;

export var rootDir = resolve(__dirname, "..");
