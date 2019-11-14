'use strict';
import { worker as MyProcess } from "cluster";
import { createHmac } from "crypto";
import { Application } from "express";
import { RequestHandlerParams } from "express-serve-static-core";
import { readFileSync } from "fs";
import { IncomingMessage, Server } from "http";
import { Client, generators, Issuer } from "openid-client";
import { basename, resolve } from "path";
import { get as getPromise } from "request-promise-native";
import { isBuffer } from "util";
import { Data, Server as wss } from "ws";
import { NodeConfig, rootDir } from "@/config";
import { Logger } from "@/lib/tools/Logger";
import { AuthTypes, ExtendedWSClient, FacebookOpenIdData, FacebookOpenIdProfile, FacebookSignedPayload, GoogleOpenIdData, OpenIdServiceIndex, StorageInterface, userCodes, wsCodes } from "@/models";
import { User } from "../User";
import { WorkerProcess } from "./WorkerProcess";
import express = require("express");
import favicon = require("serve-favicon");
import querystring = require("querystring");
import uuidv4 = require("uuid/v4");

/**
 *
 *
 * @export
 * @class WSAuthServer
 * @extends {WorkerProcess}
 */
export abstract class WSAuthServer<T extends StorageInterface<any>> extends WorkerProcess {
	// protected static _NodeConfig: NodeConfig = null;
	protected static highlander = null;

	public static get NodeConfig(): NodeConfig {
		return WSAuthServer._NodeConfig;
	};

	// public static getInstance<S extends StorageInterface<any,any>>(nc?: NodeConfig, s: S = null): WSAuthServer<S> {
	// 	WSAuthServer._NodeConfig = nc ? nc : WSAuthServer.NodeConfig;
	// 	if (!WSAuthServer.highlander) {
	// 		WSAuthServer.highlander = new WSAuthServer<S>(s);
	// 	}
	// 	return WSAuthServer.highlander;
	// }

	protected get Storage(): T {
		if (!this._storage) {
			this._storage = null;
		}
		return this._storage;
	}

	// Web and WebSocket Server
	protected wsServer: wss = null;					// WebSocket Server
	protected wwwServer: Server = null;				// Http Server
	protected wwwApplication: Application = null;	// Express

	// OpenID connect
	protected issuer: Map<string, Issuer<Client>> = new Map<string, Issuer<Client>>();
	protected clients: Map<string, Client> = new Map<string, Client>();

	/**
	 * Creates an instance of WSAuthServer.
	 * @memberof WSAuthServer
	 */
	protected constructor(protected _storage: T) {
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
	 * @param {ExtendedWSClient} ws
	 * @param {User} user
	 * @memberof WSAuthServer
	 */
	protected onUserLogin(ws: ExtendedWSClient<User>, user: User): void {
		const responseCode = Buffer.alloc(2);
		responseCode.writeUInt8(wsCodes.USER, 0);
		responseCode.writeUInt8(userCodes.SELF, 1);
		user.isOnline = true;
		if (!ws.data) {
			ws.data = {
				user: user,
				id: uuidv4()
			};
		} else {
			ws.data.user = user;
		}
		this.Storage.saveUser(user);
		ws.send(Buffer.concat([
			responseCode,
			Buffer.from(JSON.stringify(user.exportProfile()))
		]));

		this.boadcastUser(user);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof WSAuthServer
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
		// ROUTES		//
		this.configureWebServer();
		// others
		this.wwwApplication.get("*", this.routeNotAvailable());
		// END ROUTES	//

		this.wwwServer = this.wwwApplication.listen(WSAuthServer.NodeConfig.www.port);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof WSAuthServer
	 */
	protected configureWebServer(): void {
		const apiMiddleware = [express.json({}), express.urlencoded({ extended: true })];
		// this.wwwApplication.get("/login/google/", apiMiddleware, this.routeOpenIDGoogleCallback());
		// this.wwwApplication.get("/login/microsoft/", apiMiddleware, this.routeOpenIDGoogleCallback());
		this.wwwApplication.get("/login/facebook/", apiMiddleware, this.routeOpenIDFacebookLoginCallback());
		this.wwwApplication.post("/logout/facebook/", apiMiddleware, this.routeOpenIDFacebookLogoutCallback());
		this.wwwApplication.post("/delete/facebook/", apiMiddleware, this.routeOpenIDFacebookDeleteCallback());
		this.wwwApplication.get("/login/steam/", apiMiddleware, this.routeOpenIDSteamCallback());
		// OIDC
		this.wwwApplication.post("/login/google/", apiMiddleware, this.routeOpenIDGoogleCallback());
		this.wwwApplication.post("/login/microsoft/", apiMiddleware, this.routeOpenIDMicrosoftCallback());
		this.wwwApplication.get("/login/twitch/", apiMiddleware, this.routeOpenIDTwitchCallback());
		this.wwwApplication.post("/login/twitch/", apiMiddleware, this.routeOpenIDTwitchCallback());

		// Local stuff
		this.wwwApplication.get("/login/local/", apiMiddleware, this.routeLoginLocal());
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof WSAuthServer
	 */
	protected createWebsocketServer(): void {
		this.wsServer = new wss({ port: WSAuthServer.NodeConfig.ws.port, host: WSAuthServer.NodeConfig.ws.host });

		this.wsServer.on("headers", (headers, req: IncomingMessage) => {
			const { nonce, access_token } = this.getCookies(req);
			const [ip] = req.headers['x-forwarded-for'] ? (req.headers['x-forwarded-for'] as string).split(/\s*,\s*/) : [req.connection.remoteAddress];
			Logger(0, "wsClient.onHeaders", `new headers request from <${ip}> via <${req.connection.remoteAddress}>`);
			// TODO: refresh accessToken
			Logger(0, "wsClient.onHeaders", `access_token ${access_token ? '' : 'not'} found`);

			headers.push(`Set-Cookie: NONCE=${nonce || generators.nonce()}; Max-Age=${60 * 60 * 4}; Domain=${WSAuthServer.NodeConfig.ws.cookieDomain}; secure`);
		});

		this.wsServer.on("connection", (wsClient: ExtendedWSClient<User>, req: IncomingMessage) => {
			const [ip] = req.headers['x-forwarded-for'] ? (req.headers['x-forwarded-for'] as string).split(/\s*,\s*/) : [req.connection.remoteAddress];
			Logger(0, "wsClient.onConnection", `new Connection from <${ip}> via <${req.connection.remoteAddress}>`);


			const { nonce, access_token } = this.getCookies(req);

			// TODO: why is nonce not set? find a better solution as force reconnect
			if (!nonce) {
				Logger(0, "wsClient.onConnection", `nonce not set, closing connection`, nonce, access_token);
				wsClient.close();
				return;
			}
			wsClient.data = {
				user: null,
				nonce: nonce,
				id: uuidv4(), // create a connection id for this connection session
			};
			if (access_token) {
				const user = this.Storage.fetchUserByAccessToken(access_token);
				if (user) {
					Logger(0, "wsClient.onConnection", `access_token set and user found ${user.id}`);
					this.onUserLogin(wsClient, user);
				} else {
					Logger(0, "wsClient.onConnection", `access_token set but no user found ${access_token}`);
				}
			}

			this.onConnection(wsClient, req);

			wsClient.on("message", (data: Data) => {
				if (isBuffer(data)) {
					const code = (<Buffer>data).readUInt8(0);
					const payload = (<Buffer>data).slice(1);
					this.onMessage(wsClient, code, payload);
				} else {
					Logger(511, basename(__filename), "wsClient.onMessage", `No Buffer data, got ${typeof data}`, data);
				}
			});

			wsClient.on("close", (code, reason) => {
				this.onConnectionClose(wsClient, code, reason);
			});
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @param {ExtendedWSClient<User>} ws
	 * @param {number} code
	 * @param {string} reason
	 * @memberof WSAuthServer
	 */
	protected onConnectionClose(ws: ExtendedWSClient<User>, code: number, reason: string): void {
		const user = ws.data.user;
		if (!user) {
			return;
		}
		const responseCode = Buffer.alloc(2);
		responseCode.writeUInt8(wsCodes.USER, 0);
		responseCode.writeUInt8(userCodes.OTHER, 1);
		user.isOnline = false;
		const userMessage = Buffer.concat([
			responseCode,
			Buffer.from(JSON.stringify(user.exportProfile())),
			// chatUser.exportToBuffer()
		]);

		this.wsServer.clients.forEach((C: ExtendedWSClient<User>) => {
			if (!C.OPEN || C.data.id === ws.data.id) {
				return;
			}
			// Send this user as 'other' user to every client
			C.send(userMessage);
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @param {ExtendedWSClient} ws
	 * @param {wsCodes} code
	 * @param {Buffer} data
	 * @memberof WSAuthServer
	 */
	protected onMessage(ws: ExtendedWSClient<User>, code: wsCodes, data: Buffer): void {
		switch (code) {
			case wsCodes.AUTH: this.handleAuthMessage(ws, data as Buffer); break;
			default:
				Logger(511, "wsClient.onMessage", `Unknown message.code: ${code}`, data, data.toString());
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {ExtendedWSClient} ws
	 * @param {IncomingMessage} req
	 * @memberof WSAuthServer
	 */
	protected onConnection(ws: ExtendedWSClient<User>, req: IncomingMessage): void {

		if (!ws.data.user) {
			const code = Buffer.alloc(1);
			code.writeUInt8(wsCodes.AUTH, 0);
			const bufContent = Buffer.from(WSAuthServer.NodeConfig.www.localLoginUri);

			ws.send(Buffer.concat([
				code,
				bufContent
			]));
		} else {

		}

		const responseCode = Buffer.alloc(2);
		responseCode.writeUInt8(wsCodes.USER, 0);
		responseCode.writeUInt8(userCodes.OTHER, 1);

		// Send all active users to this client
		this.wsServer.clients.forEach((C: ExtendedWSClient<User>) => {
			if (!C.OPEN || C.data.id === ws.data.id || !C.data.user) {
				return;
			}
			if (ws.data.user) {
				const userMessage = Buffer.concat([
					responseCode,
					Buffer.from(JSON.stringify(ws.data.user.exportProfile())),
					// chatUser.exportToBuffer()
				]);
				C.send(userMessage);
			}
			const userMessage = Buffer.concat([
				responseCode,
				Buffer.from(JSON.stringify(C.data.user.exportProfile())),
				// chatUser.exportToBuffer()
			]);
			ws.send(userMessage);
		});

	}

	/**
	 *
	 *
	 * @protected
	 * @returns {Promise<void>}
	 * @memberof WSAuthServer
	 */
	protected async createIssuer(): Promise<void> {
		const openIDConfig = WSAuthServer.NodeConfig.openid;
		if(!openIDConfig){
			return;
		}
		// Google
		if (openIDConfig.google && openIDConfig.google.client_id) {
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
		}
		// Microsoft
		if (openIDConfig.microsoft && openIDConfig.microsoft.client_id) {
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
		// Twitch
		if (openIDConfig.twitch && openIDConfig.twitch.client_id) {
			try {
				const config = openIDConfig.twitch;
				const twitchIssuer = await Issuer.discover(config.discover_url);
				this.issuer.set("twitch", twitchIssuer);
				const twitchClient = new twitchIssuer.Client({
					client_id: config.client_id,
					client_secret: config.client_secret,
					redirect_uris: config.redirect_uris,
					response_type: "code id_token",
					// default_max_age: 300,
				});
				this.clients.set("twitch", twitchClient);
			} catch (error) {
				Logger(911, "createIssuer->twitch", error);
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {ExtendedWSClient} wsClient
	 * @param {Buffer} data
	 * @memberof WSAuthServer
	 */
	protected handleAuthMessage(wsClient: ExtendedWSClient<User>, data: Buffer) {
		if (data.length < 1) {
			Logger(911, "handleAuthMessage", `no data received <${data}>`);
			return;
		}
		const type = (<Buffer>data).readUInt8(0);
		switch (type) {
			case AuthTypes.LOGOUT:
				{
					const user = wsClient.data.user;
					user.isOnline = false;
					this.boadcastUser(user);
					wsClient.data.user = null;

					// force logout sending self user null
					const responseCode = Buffer.alloc(2);
					responseCode.writeUInt8(wsCodes.USER, 0);
					responseCode.writeUInt8(userCodes.SELF, 1);

					wsClient.send(Buffer.concat([
						responseCode,
						Buffer.from(JSON.stringify(null))
					]));

					// send guest login url
					const code = Buffer.alloc(1);
					code.writeUInt8(wsCodes.AUTH, 0);
					const bufContent = Buffer.from(WSAuthServer.NodeConfig.www.localLoginUri);

					wsClient.send(Buffer.concat([
						code,
						bufContent
					]));
				}
				break;
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
			case AuthTypes.TWITCH:
				Logger(0, "handleAuthMessage", `New twitch auth message`);
				const tc = this.clients.get("twitch");
				if (tc) {
					const nonce = wsClient.data.nonce;
					Logger(0, "handleAuthMessage", `Using ${nonce} for twitch authorizationUrl`);
					const url = tc.authorizationUrl({
						scope: ["openid"].join(" "), //
						response_mode: 'form_post',
						response_type: "code",
						nonce: nonce,
						claims: JSON.stringify({
							"id_token": {
								"email_verified": null
							},
							"userinfo": {
								"email": null,
								"picture": null,
								"preferred_username": null
							}
						}),
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

					const config = WSAuthServer.NodeConfig.openid.steam;
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
					const config = WSAuthServer.NodeConfig.openid.facebook;
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
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDGoogleCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = WSAuthServer.NodeConfig.openid.google;
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


				const wsClient = this.getWsClientByNONCE(nonce);
				const U = this.Storage.fetchUserByOpenId(user.sub, OpenIdServiceIndex.GOOGLE) || User.createFromGoogle(user, wsClient.data.user);
				// set access_token cookie to remember user
				res.cookie("access_token", U.createAccessToken(OpenIdServiceIndex.GOOGLE, req.connection.remoteAddress, req.headers["user-agent"]).token, { secure: true, domain: WSAuthServer.NodeConfig.ws.cookieDomain, maxAge: 1000 * 60 * 60 * 24 * 7 });
				res.status(200).send(content).end();
				this.Storage.saveUser(U);
				this.onUserLogin(wsClient, U);

				Logger(0, "routeOpenIDGoogleCallback", `User logged in: ${U.exportProfile().name}`);
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
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDMicrosoftCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = WSAuthServer.NodeConfig.openid.microsoft;
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
				const wsClient = this.getWsClientByNONCE(nonce);

				const U = this.Storage.fetchUserByOpenId(user.sub, OpenIdServiceIndex.MICROSOFT) || User.createFromMicrosoft(user, wsClient.data.user);
				// set access_token cookie to remember user
				res.cookie("access_token", U.createAccessToken(OpenIdServiceIndex.MICROSOFT, req.connection.remoteAddress, req.headers["user-agent"]).token, { secure: true, domain: WSAuthServer.NodeConfig.ws.cookieDomain, maxAge: 1000 * 60 * 60 * 24 * 7 });
				this.Storage.saveUser(U);
				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();

				this.onUserLogin(wsClient, U);

				Logger(0, "routeOpenIDMicrosoftCallback", `User logged in: ${U.exportProfile().name}`);
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
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDTwitchCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = WSAuthServer.NodeConfig.openid.twitch;
				const { nonce } = this.getCookies(req);
				const mc = this.clients.get("twitch");
				const params = mc.callbackParams(req);
				const [redirectUri] = config.redirect_uris; // Todo: handle multiple redirect uris (is there any case=?)
				// Logger(0, "routeOpenIDTwitchCallback", `Authorization callback ${redirectUri} uses nonce=>${nonce} and params=>`, params);
				const tokenSet = await mc.callback(redirectUri, params, {
					nonce: nonce,
					// max_age: 300
				});
				const user = await mc.userinfo(tokenSet);

				const userFromDB = this.Storage.fetchUserByOpenId(user.sub, OpenIdServiceIndex.TWITCH);
				const wsClient = this.getWsClientByNONCE(nonce);
				const U = userFromDB ? userFromDB : User.createFromTwitch(user, wsClient.data.user);

				// set access_token cookie to remember user
				res.cookie("access_token", U.createAccessToken(OpenIdServiceIndex.TWITCH, req.connection.remoteAddress, req.headers["user-agent"]).token, { secure: true, domain: WSAuthServer.NodeConfig.ws.cookieDomain, maxAge: 1000 * 60 * 60 * 24 * 7 });
				this.Storage.saveUser(U);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();

				if (!wsClient) {
					throw `no wsClient found for nonce=>${nonce}`
				}
				this.onUserLogin(wsClient, U);

				Logger(0, "routeOpenIDTwitchCallback", `User logged in: ${U.exportProfile().name}`);
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDTwitchCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDSteamCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = WSAuthServer.NodeConfig.openid.steam;
				const { nonce } = this.getCookies(req);

				const steamId64 = req.query["openid.claimed_id"].split("/").pop();
				const api_interface = "ISteamUser";
				const api_method = "GetPlayerSummaries";
				const api_version = "0002";

				const profileRaw = await getPromise(`https://api.steampowered.com/${api_interface}/${api_method}/v${api_version}/?key=${config.api_key}&format=json&steamids=${steamId64}`);
				const profile: { response: { players: any[] } } = JSON.parse(profileRaw);

				// Logger(0, "routeOpenIDSteamCallback", steamId64, profile.response.players);
				const [user] = profile.response.players;

				const wsClient = this.getWsClientByNONCE(nonce);
				const U = this.Storage.fetchUserByOpenId(user.steamid, OpenIdServiceIndex.STEAM) || User.createFromSteam(user, wsClient.data.user);

				// set access_token cookie to remember user
				res.cookie("access_token", U.createAccessToken(OpenIdServiceIndex.STEAM, req.connection.remoteAddress, req.headers["user-agent"]).token, { secure: true, domain: WSAuthServer.NodeConfig.ws.cookieDomain, maxAge: 1000 * 60 * 60 * 24 * 7 });
				this.Storage.saveUser(U);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();


				this.onUserLogin(wsClient, U);

				Logger(0, "routeOpenIDMicrosoftCallback", `User logged in: ${U.exportProfile().name}`);
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
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDFacebookLoginCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const config = WSAuthServer.NodeConfig.openid.facebook;
				const { nonce } = this.getCookies(req);
				const wsClient = this.getWsClientByNONCE(nonce);


				const { code, state } = req.query;

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");


				if (state !== wsClient.data.fbstate) {
					Logger(511, "routeOpenIDFacebookLoginCallback", `unequal state during fb-login process! is: ${state} expected: ${wsClient.data.fbstate}`);
					// todo: message to frontend
					res.status(200).send(content).end();
					return;
				}
				const accessKeyRaw = await getPromise(`https://graph.facebook.com/v5.0/oauth/access_token?client_id=${config.params.client_id}&redirect_uri=${config.params.redirect_uri}&client_secret=${config.client_secret}&code=${code}`);

				const { access_token, token_type, expires_in } = JSON.parse(accessKeyRaw);


				const profileRaw: FacebookOpenIdProfile = JSON.parse(await getPromise(`https://graph.facebook.com/v5.0/me?fields=id%2Cname%2Cpicture&access_token=${access_token}`));

				// const { id, name, picture } = JSON.parse(profileRaw);
				const openIdData: FacebookOpenIdData = {
					sub: profileRaw.id,
					access_token,
					token_type,
					expires_in,
					profile: profileRaw,
				};

				const U = this.Storage.fetchUserByOpenId(openIdData.sub, OpenIdServiceIndex.FACEBOOK) || User.createFromFacebook(openIdData, wsClient.data.user);
				// set access_token cookie to remember user
				res.cookie("access_token", U.createAccessToken(OpenIdServiceIndex.FACEBOOK, req.connection.remoteAddress, req.headers["user-agent"]).token, { secure: true, domain: WSAuthServer.NodeConfig.ws.cookieDomain, maxAge: 1000 * 60 * 60 * 24 * 7 });
				this.Storage.saveUser(U);
				res.status(200).send(content).end();

				this.onUserLogin(wsClient, U);

				Logger(0, "routeOpenIDFacebookCallback", `User logged in: ${U.exportProfile().name}`);
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDFacebookCallback]", error);
				res.status(500).end();
			}
		}
	}



	/**
	 * decode facebook signed requests
	 *
	 * @protected
	 * @param {string} data
	 * @returns {FacebookSignedPayload}
	 * @memberof WSAuthServer
	 */
	protected decodeFacebookSignedRequest(data: string): FacebookSignedPayload {
		try {
			const [sigRaw, payloadRaw] = data.split(".");
			const signature = Buffer.from(sigRaw, "base64").toString("utf8");
			const payloadString = Buffer.from(payloadRaw, "base64").toString("utf8");
			const payload = JSON.parse(payloadString);

			const hmac = createHmac("sha256", WSAuthServer.NodeConfig.openid.facebook.client_secret);
			const verifySig = hmac.update(payloadString).digest("hex");
			console.log(signature, payload, verifySig);

			return payload;

		} catch (error) {
			throw error;
		}
	}

	/**
	 * post messages from facebook to logout user
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDFacebookLogoutCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const { signed_request } = req.body;
				const data = this.decodeFacebookSignedRequest(signed_request);

				console.log(data);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDFacebookLogoutCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 * post message from facebook to delete all user data related to facebook
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof WSAuthServer
	 */
	protected routeOpenIDFacebookDeleteCallback(): RequestHandlerParams {
		return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
			try {
				const { signed_request } = req.body;
				const data = this.decodeFacebookSignedRequest(signed_request);

				console.log(data);

				const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
				res.status(200).send(content).end();
			} catch (error) {
				Logger(911, "@W" + MyProcess.id, "[routeOpenIDFacebookDeleteCallback]", error);
				res.status(500).end();
			}
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof WSAuthServer
	 */
	protected routeLoginLocal(): RequestHandlerParams {
		return (req: express.Request, res: express.Response, next: express.NextFunction) => {
			const { nonce } = this.getCookies(req);

			const wsClient = this.getWsClientByNONCE(nonce);
			// guest login
			const U = new User();
			this.Storage.saveUser(U);

			res.cookie("access_token", U.createAccessToken(OpenIdServiceIndex.LOCAL, req.connection.remoteAddress, req.headers["user-agent"]).token, { secure: true, domain: WSAuthServer.NodeConfig.ws.cookieDomain, maxAge: 1000 * 60 * 60 * 24 * 7 });
			const content = readFileSync(resolve(rootDir, "assets", "selfclose.html")).toString("utf8");
			res.status(200).send(content).end();
			this.onUserLogin(wsClient, U);
			Logger(0, "routeOpenIDFacebookCallback", `Guest logged in: ${U.exportProfile().name}`);
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {RequestHandlerParams}
	 * @memberof WSAuthServer
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
	 * @memberof WSAuthServer
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
	 * @memberof WSAuthServer
	 */
	protected getCookies(req: IncomingMessage): { nonce?: string, access_token?: string } {
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
	 * @memberof WSAuthServer
	 */
	protected getWsClientByNONCE(nonce: string): ExtendedWSClient<User> {
		const [client1, ...other] = Array.from<ExtendedWSClient<User>>(this.wsServer.clients.values() as IterableIterator<ExtendedWSClient<User>>).filter((v: ExtendedWSClient<User>) => v.OPEN && v.data.nonce === nonce);
		if (other.length > 0) {
			Logger(511, "getWsClientByNONCE", `Multiple websocket clients(+${other.length}) found with nonce=>${nonce}`);
		}
		return client1;
	}

	/**
	 *
	 *
	 * @protected
	 * @param {string} id
	 * @returns {ExtendedWSClient[]}
	 * @memberof WSAuthServer
	 */
	protected getWSClientsByUserId(id: string): ExtendedWSClient<User>[] {
		const clients = Array.from<ExtendedWSClient<User>>(this.wsServer.clients.values() as IterableIterator<ExtendedWSClient<User>>).filter((v: ExtendedWSClient<User>) => v.OPEN && v.data.user && v.data.user.id === id);
		if (clients.length > 1) {
			Logger(111, "getWSClientByUserId", `Multiple websocket clients(${clients.length}) found with userId=>${id}`, clients.map(C => C.data.id));
		}
		return clients;
	}

	/**
	 *
	 *
	 * @protected
	 * @param {User} user
	 * @memberof WSAuthServer
	 */
	protected boadcastUser(user: User): void {
		const responseCode = Buffer.alloc(2);
		responseCode.writeUInt8(wsCodes.USER, 0);
		responseCode.writeUInt8(userCodes.OTHER, 1);

		const userMessage = Buffer.concat([
			responseCode,
			Buffer.from(JSON.stringify(user.exportProfile())),
			// chatUser.exportToBuffer()
		]);

		this.wsServer.clients.forEach((C: ExtendedWSClient<User>) => {
			const userA = C.data.user;
			const userB = user;
			const sameUser = !userA || !userB ? false : userA.id === userB.id;
			if (sameUser || !C.OPEN) {
				return;
			}
			C.send(userMessage);
		});
	}

	/**
	 *
	 *
	 * @param {NodeConfig} nc
	 * @memberof WSAuthServer
	 */
	public updateConfig(nc: NodeConfig): void {
		Object.assign(WSAuthServer._NodeConfig, nc);
	}

	/**
	 *
	 *
	 * @param {(string | number | Error)} [signal]
	 * @returns {Promise<boolean>}
	 * @memberof WSAuthServer
	 */
	public async destroy(signal?: string | number | Error): Promise<boolean> {
		this.wwwServer.close();
		this.wsServer.close();
		this.timer.unref();
		return true;
	}

}
