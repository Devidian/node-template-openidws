import { worker as MyProcess } from "cluster";
import { Application } from "express";
import { RequestHandlerParams } from "express-serve-static-core";
import { readFileSync } from "fs";
import { IncomingMessage, Server } from "http";
import { Client, generators, Issuer } from "openid-client";
import { basename, resolve } from "path";
import { get as getPromise } from "request-promise-native";
import { GoogleOpenIdData } from "src/models/OpenIdData";
import { isBuffer } from "util";
import { Data, Server as wss } from "ws";
import { cfg, NodeConfig, rootDir } from "../config";
import { Logger } from "../lib/tools/Logger";
import { AuthTypes, userCodes, wsCodes } from "../models/enums";
import { User } from "./User";
import { WorkerProcess } from "./WorkerProcess";
import WebSocket = require("ws");
import express = require("express");
import favicon = require("serve-favicon");
import querystring = require("querystring");
import uuidv4 = require("uuid/v4");

/**
 *
 *
 * @interface ExtendedWSClient
 * @extends {WebSocket}
 */
interface ExtendedWSClient extends WebSocket {
	data: {
		user: User,
		[key: string]: any
	},
	upgradeReq: any,
}

/**
 *
 *
 * @export
 * @class MyClass
 * @extends {WorkerProcess}
 */
export class MyClass extends WorkerProcess {
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

	// Web and WebSocket Server
	protected wsServer: wss = null;					// WebSocket Server
	protected wwwServer: Server = null;				// Http Server
	protected wwwApplication: Application = null;	// Express

	// OpenID connect
	protected issuer: Map<string, Issuer<Client>> = new Map<string, Issuer<Client>>();
	protected clients: Map<string, Client> = new Map<string, Client>();

	/**
	 * Creates an instance of MyClass.
	 * @memberof MyClass
	 */
	constructor() {
		super();
		this.createWebServer();
		this.createWebsocketServer();
		this.createIssuer();
		this.timer = setTimeout(_ => { this.run(); }, 200);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof MyClass
	 */
	protected createWebServer(): void {
		this.wwwApplication = express();
		// CONFIGURATION //
		this.wwwApplication.disable('x-powered-by');
		this.wwwApplication.use((err: express.Errback, req: express.Request, res: express.Response, next: express.NextFunction) => {
			Logger(911, "express", err);
			res.status(500).end();
		});

		this.wwwApplication.use(favicon(resolve(rootDir, 'assets', 'favicon.ico')));
		const apiMiddleware = [express.json({}), express.urlencoded({ extended: true })];
		// ROUTES		//
		// this.wwwApplication.get("/login/google/", apiMiddleware, this.routeOpenIDGoogleCallback());
		// this.wwwApplication.get("/login/microsoft/", apiMiddleware, this.routeOpenIDGoogleCallback());
		this.wwwApplication.get("/login/facebook/", apiMiddleware, this.routeOpenIDFacebookCallback());
		this.wwwApplication.get("/login/steam/", apiMiddleware, this.routeOpenIDSteamCallback());
		this.wwwApplication.post("/login/google/", apiMiddleware, this.routeOpenIDGoogleCallback());
		this.wwwApplication.post("/login/microsoft/", apiMiddleware, this.routeOpenIDMicrosoftCallback());

		// others
		this.wwwApplication.get("*", this.routeNotAvailable());
		// END ROUTES	//

		this.wwwServer = this.wwwApplication.listen(MyClass.NodeConfig.www.port);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof MyClass
	 */
	protected createWebsocketServer(): void {
		this.wsServer = new wss({ port: MyClass.NodeConfig.ws.port, host: MyClass.NodeConfig.ws.host });

		this.wsServer.on("headers", (headers, req: IncomingMessage) => {
			const { nonce } = this.getCookies(req);

			headers.push(`Set-Cookie: NONCE=${nonce || generators.nonce()}; Max-Age=${60 * 60 * 4}; Domain=${MyClass.NodeConfig.ws.cookieDomain}; secure`);
		});

		this.wsServer.on("connection", (wsClient: ExtendedWSClient, req: IncomingMessage) => {
			const [ip] = req.headers['x-forwarded-for'] ? (req.headers['x-forwarded-for'] as string).split(/\s*,\s*/) : [req.connection.remoteAddress];
			Logger(0, "wsClient.onConnect", `new Connection from <${ip}> via <${req.connection.remoteAddress}>`);


			const { nonce } = this.getCookies(req);

			wsClient.data = {
				user: null,
				nonce: nonce,
			};

			wsClient.on("message", (data: Data) => {
				if (isBuffer(data)) {
					const code = (<Buffer>data).readUInt8(0);
					switch (code) {
						case wsCodes.AUTH: this.handleAuthMessage(wsClient, data as Buffer); break;
						default:
							Logger(511, "wsClient.onMessage", `Unknown message.code: ${code}`, data, data.toString())
					}

				} else {
					Logger(511, basename(__filename), "wsClient.onMessage", `No Buffer data, got ${typeof data}`, data);
				}
			});
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {Promise<void>}
	 * @memberof MyClass
	 */
	protected async createIssuer(): Promise<void> {
		const openIDConfig = MyClass.NodeConfig.openid;
		try {
			const config = openIDConfig.google;
			const googleIssuer = await Issuer.discover(config.discover_url);
			this.issuer.set("google", googleIssuer);
			const googleClient = new googleIssuer.Client({
				client_id: config.client_id,
				client_secret: config.client_secret,
				redirect_uris: config.redirect_uris,
				response_type: "code id_token", //s: ["code", "id_token"],
				// default_max_age: 300,
			});

			this.clients.set("google", googleClient);

		} catch (error) {
			Logger(911, "createIssuer->google", error);
		}

		try {
			const config = openIDConfig.microsoft;
			const microsoftIssuer = await Issuer.discover(config.discover_url);
			this.issuer.set("microsoft", microsoftIssuer);
			const microsoftClient = new microsoftIssuer.Client({
				client_id: config.client_id,
				client_secret: config.client_secret,
				redirect_uris: config.redirect_uris,
				response_type: "code id_token",
				// default_max_age: 300,
			});
			this.clients.set("microsoft", microsoftClient);
		} catch (error) {
			Logger(911, "createIssuer->microsoft", error);
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {ExtendedWSClient} wsClient
	 * @param {Buffer} data
	 * @memberof MyClass
	 */
	protected handleAuthMessage(wsClient: ExtendedWSClient, data: Buffer) {
		const type = (<Buffer>data).readUInt8(1);
		switch (type) {
			case AuthTypes.GOOGLE:
				Logger(0, "handleAuthMessage", `New google auth message`);
				const gc = this.clients.get("google");
				if (gc) {
					// const code_verifier = generators.codeVerifier();
					// wsClient.data.verifier = code_verifier;
					// const code_challenge = generators.codeChallenge(code_verifier);
					const nonce = wsClient.data.nonce;
					Logger(0, "handleAuthMessage", `Using ${nonce} for google authorizationUrl`);
					const url = gc.authorizationUrl({
						scope: ["openid", "email", "profile"].join(" "),
						response_mode: 'form_post',
						nonce: nonce,
						// max_age: "300",
						// code_challenge,
						// code_challenge_method: "S256",

					});
					const code = Buffer.alloc(1);
					code.writeUInt8(wsCodes.AUTH, 0);
					const bufContent = Buffer.from(url);
					wsClient.send(Buffer.concat([
						code,
						bufContent
					]));
				}
				break;

			case AuthTypes.MICROSOFT:
				Logger(0, "handleAuthMessage", `New microsoft auth message`);
				const mc = this.clients.get("microsoft");
				if (mc) {
					const nonce = wsClient.data.nonce;
					Logger(0, "handleAuthMessage", `Using ${nonce} for microsoft authorizationUrl`);
					const url = mc.authorizationUrl({
						scope: ["openid", "email", "profile"].join(" "),
						response_mode: 'form_post',
						nonce: nonce,
						// claims: {
						// 	userinfo: {
						// 		nickname: { essential: true },
						// 		family_name: { essential: true },
						// 		given_name: { essential: true },
						// 	},
						// },
						// max_age: "300",
						// code_challenge,
						// code_challenge_method: "S256",

					});
					const code = Buffer.alloc(1);
					code.writeUInt8(wsCodes.AUTH, 0);
					const bufContent = Buffer.from(url);
					wsClient.send(Buffer.concat([
						code,
						bufContent
					]));
				}
				break;
			// NON connect providers
			case AuthTypes.STEAM:
				Logger(0, "handleAuthMessage", `New steam auth message`);
				try {

					const config = MyClass.NodeConfig.openid.steam;
					const qs = querystring.encode(config.params);
					const code = Buffer.alloc(1);
					code.writeUInt8(wsCodes.AUTH, 0);
					const bufContent = Buffer.from(config.basic_url + "?" + qs);
					wsClient.send(Buffer.concat([
						code,
						bufContent
					]));

				} catch (error) {
					Logger(911, "handleAuthMessage.STEAM", error);
				}
				break;
			case AuthTypes.FACEBOOK:
				Logger(0, "handleAuthMessage", `New facebook auth message`);
				try {
					const config = MyClass.NodeConfig.openid.facebook;
					const params = Object.assign({}, config.params);
					params.state = uuidv4();
					const qs = querystring.encode(params);
					const code = Buffer.alloc(1);
					code.writeUInt8(wsCodes.AUTH, 0);
					const bufContent = Buffer.from(config.basic_url + "?" + qs);
					wsClient.data.fbstate = params.state;
					wsClient.send(Buffer.concat([
						code,
						bufContent
					]));

				} catch (error) {
					Logger(911, "handleAuthMessage.FACEBOOK", error);
				}
				break;
			default:
				Logger(911, "handleAuthMessage", `Unknown auth message type ${type}`);
				break;
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof MyClass
	 */
	protected routeOpenIDGoogleCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = MyClass.NodeConfig.openid.google;
				const { nonce } = this.getCookies(req);
				const gc = this.clients.get("google");
				const params = gc.callbackParams(req);
				const [redirectUri] = config.redirect_uris; // Todo: handle multiple redirect uris (is there any case=?)
				// Logger(0, "routeOpenIDGoogleCallback", `Authorization callback ${redirectUri} uses nonce=>${nonce} and params=>`, params);
				const tokenSet = await gc.callback(redirectUri, params, {
					nonce: nonce,
					// max_age: 300
				});
				const user: GoogleOpenIdData = await gc.userinfo(tokenSet);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();

				const U = User.createFromGoogle(user);

				const code = Buffer.alloc(2);
				code.writeUInt8(wsCodes.USER, 0);
				code.writeUInt8(userCodes.SELF, 1);

				const wsClient = this.getWsClientByNONCE(nonce);
				wsClient.data.user = U;
				wsClient.data.tokenSet = tokenSet;
				wsClient.send(Buffer.concat([
					code,
					Buffer.from(JSON.stringify(U.exportProfile()))
				]));
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDGoogleCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof MyClass
	 */
	protected routeOpenIDMicrosoftCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = MyClass.NodeConfig.openid.microsoft;
				const { nonce } = this.getCookies(req);
				const mc = this.clients.get("microsoft");
				const params = mc.callbackParams(req);
				const [redirectUri] = config.redirect_uris; // Todo: handle multiple redirect uris (is there any case=?)
				// Logger(0, "routeOpenIDMicrosoftCallback", `Authorization callback ${redirectUri} uses nonce=>${nonce} and params=>`, params);
				const tokenSet = await mc.callback(redirectUri, params, {
					nonce: nonce,
					// max_age: 300
				});
				const user = await mc.userinfo(tokenSet);
				// console.log(tokenSet, tokenSet.claims(), user);

				const U = User.createFromMicrosoft(user);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();

				const code = Buffer.alloc(2);
				code.writeUInt8(wsCodes.USER, 0);
				code.writeUInt8(userCodes.SELF, 1);

				const wsClient = this.getWsClientByNONCE(nonce);
				wsClient.data.user = U;
				wsClient.data.tokenSet = tokenSet;
				wsClient.send(Buffer.concat([
					code,
					Buffer.from(JSON.stringify(U.exportProfile()))
				]));
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDMicrosoftCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof MyClass
	 */
	protected routeOpenIDSteamCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = MyClass.NodeConfig.openid.steam;
				const { nonce } = this.getCookies(req);

				const steamId64 = req.query["openid.claimed_id"].split("/").pop();
				const api_interface = "ISteamUser";
				const api_method = "GetPlayerSummaries";
				const api_version = "0002";

				const profileRaw = await getPromise(`https://api.steampowered.com/${api_interface}/${api_method}/v${api_version}/?key=${config.api_key}&format=json&steamids=${steamId64}`);
				const profile: { response: { players: any[] } } = JSON.parse(profileRaw);

				// Logger(0, "routeOpenIDSteamCallback", steamId64, profile.response.players);
				const [user] = profile.response.players;

				const U = User.createFromSteam(user);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();


				const code = Buffer.alloc(2);
				code.writeUInt8(wsCodes.USER, 0);
				code.writeUInt8(userCodes.SELF, 1);

				const wsClient = this.getWsClientByNONCE(nonce);
				wsClient.data.user = U;
				// wsClient.data.tokenSet = tokenSet;
				wsClient.send(Buffer.concat([
					code,
					Buffer.from(JSON.stringify(U.exportProfile()))
				]));
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDMicrosoftCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof MyClass
	 */
	protected routeOpenIDFacebookCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = MyClass.NodeConfig.openid.facebook;
				const { nonce } = this.getCookies(req);

				console.log("Facebook", req.query, req.body, req.params);

				// const U = User.createFromFacebook(user);

				const code = Buffer.alloc(2);
				code.writeUInt8(wsCodes.USER, 0);
				code.writeUInt8(userCodes.SELF, 1);

				const wsClient = this.getWsClientByNONCE(nonce);
				// wsClient.data.user = U;
				// wsClient.send(Buffer.concat([
				// 	code,
				// 	Buffer.from(JSON.stringify(U.exportProfile()))
				// ]));

			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDFacebookCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof MyClass
	 */
	protected routeNotAvailable(): RequestHandlerParams {
		return (req: express.Request, res: express.Response, next: express.NextFunction) => {
			const msg404 = `${req.path} is not yet available on this server [404]`;
			const queryString = JSON.stringify(req.query);
			const body = req.body;
			Logger(510, "@W" + MyProcess.id, "[routeNotAvailable]", `Call to <${req.path}> not supported. Query: ${queryString}`, body);
			res.json({ error: msg404 }).end();
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof MyClass
	 */
	protected routeTemplate(): RequestHandlerParams {
		return (req: express.Request, res: express.Response, next: express.NextFunction) => {

		}
	}

	/**
	 * get cookies from incoming request message
	 *
	 * @protected
	 * @param {IncomingMessage} req
	 * @returns {{ nonce?: string }}
	 * @memberof MyClass
	 */
	protected getCookies(req: IncomingMessage): { nonce?: string } {
		const cookies = {};
		(req.headers.cookie || "").split("; ").forEach((v) => {
			const [key, value] = v.split("=");
			cookies[key.toLowerCase()] = value;
		});
		return cookies;
	}

	/**
	 *
	 *
	 * @protected
	 * @param {string} nonce
	 * @returns {ExtendedWSClient}
	 * @memberof MyClass
	 */
	protected getWsClientByNONCE(nonce: string): ExtendedWSClient {
		const [client1, ...other] = Array.from<ExtendedWSClient>(this.wsServer.clients.values() as IterableIterator<ExtendedWSClient>).filter((v: ExtendedWSClient) => v.data.nonce === nonce);
		if (other.length > 0) {
			Logger(511, "getWsClientByNONCE", `Multiple websocket clients found with nonce=>${nonce}`);
		}
		return client1;
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
		this.wwwServer.close();
		this.wsServer.close();
		return true;
	}

}
