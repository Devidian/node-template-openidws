import uuidv4 = require("uuid/v4");
import { DatabaseUser, FacebookOpenIdData, GoogleOpenIdData, MicrosoftOpenIdData, OpenIdData, SteamOpenIdData, TwitchOpenIdData, UserDevice } from "@/interfaces";
import { OpenIdServiceIndex} from "@/enums";
import { isNull } from "util";

export class User {
	public static guestCounter = 0;

	protected _id: string = "_new_";
	protected openId: OpenIdData = {};

	protected primaryName: string = "";
	protected avatarUrl: string = "";
	protected primaryEmail: string = "";
	protected devices: UserDevice[] = [];

	protected flagGuest: boolean = true;
	protected flagOnline: boolean = false;

	public get isGuest(): boolean {
		return this.flagGuest;
	}
	public get isOnline(): boolean {
		return this.flagOnline;
	}
	public set isOnline(value: boolean) {
		this.flagOnline = value;
	}

	public get id(): string {
		return this._id;
	}

	public get oid(): OpenIdData {
		return this.openId;
	}

	/**
	 * Creates an instance of User.
	 * @param {(Buffer | Object)} [createFrom]
	 * @param {boolean} [registred=null] Use to override guest status when creating new registred user
	 * @memberof User
	 */
	constructor(createFrom?: Buffer | Object, registred: boolean = null) {
		if (Buffer.isBuffer(createFrom)) {
			// serialized User Buffer
			this.importFromBuffer(createFrom);
			// Logger(0, "ChatUser->new()", `created new user from buffer -> ${this.primaryName}`);
		} else if (createFrom) {
			// createFrom should be an Object with the same property names
			this.importFromObject(<User>createFrom);
			// Logger(0, "ChatUser->new()", `created new user from object -> ${this.primaryName}`);
		} else {
			this._id = uuidv4();
			this.primaryName = `Guest${++User.guestCounter}`;

			// Logger(0, "ChatUser->new()", `created new user -> ${this._id}`);
		}
		if (!isNull(registred)) {
			// override guest status
			this.flagGuest = !registred;
		}
	}

	/**
	 *
	 *
	 * @param {User} input
	 * @returns {User}
	 * @memberof User
	 */
	public importFromObject(input: User): User {
		this._id = input._id || uuidv4();
		this.primaryName = input.primaryName || "Nobody";
		this.primaryEmail = input.primaryEmail || "";
		this.avatarUrl = input.avatarUrl || "";
		this.openId = input.openId || {};
		this.flagGuest = input.flagGuest || false;
		this.devices = input.devices || [];
		return this;
	}

	/**
	 *
	 *
	 * @param {Buffer} input
	 * @returns {Buffer}
	 * @memberof User
	 */
	public importFromBuffer(input: Buffer): Buffer {
		const idLength = input.readUInt8(0);
		const nameLength = input.readUInt8(1);

		// this._id =
		// this.primaryName =

		return input.slice(2 + idLength + nameLength);
	}

	/**
	 *
	 *
	 * @param {Buffer} input
	 * @returns {Buffer}
	 * @memberof User
	 */
	public exportToBuffer(input: Buffer): Buffer {
		const bufId = Buffer.from(this._id);
		const bufName = Buffer.from(this.primaryName);
		const bufLength = Buffer.alloc(2);
		bufLength.writeUInt8(bufId.byteLength, 0);
		bufLength.writeUInt8(bufName.byteLength, 1);
		return Buffer.concat([
			bufLength,
			bufId,
			bufName,
		]);
	}

	/**
	 * export user profile for frontend
	 *
	 * @memberof User
	 */
	public exportProfile() {
		return {
			id: this._id,
			name: this.primaryName,
			avatar: this.avatarUrl,
			isGuest: this.flagGuest,
			isOnline: this.flagOnline,
		}
	}

	/**
	 *
	 *
	 * @param {OpenIdServiceIndex} oids
	 * @param {string} [addr=""]
	 * @param {string} [agent=""]
	 * @returns {UserDevice}
	 * @memberof User
	 */
	public createAccessToken(oids: OpenIdServiceIndex, addr: string = "", agent: string = ""): UserDevice {
		const token = {
			addr: addr,
			agent: agent,
			service: oids,
			time: new Date(),
			token: uuidv4()
		};
		this.devices.push(token);
		return token;
	}

	/**
	 *
	 *
	 * @param {boolean} [compact=true] if set to false all openId data will be exported
	 * @memberof User
	 */
	public exportToDatabase(compact: boolean = true): DatabaseUser {
		if (compact) {
			return {
				_id: this._id,
				openId: {
					google: {
						sub: this.openId.google ? this.openId.google.sub : null
					},
					microsoft: {
						sub: this.openId.microsoft ? this.openId.microsoft.sub : null
					},
					steam: {
						sub: this.openId.steam ? this.openId.steam.sub : null
					},
					twitch: {
						sub: this.openId.twitch ? this.openId.twitch.sub : null
					},
					// facebook: {
					// 	sub: this.openId.facebook ? this.openId.facebook.sub : null
					// },
				},
				name: this.primaryName,
				avatar: this.avatarUrl,
				email: this.primaryEmail,
				devices: this.devices,
				flags: {
					guest: this.flagGuest
				}
			}
		} else {
			return {
				_id: this._id,
				openId: this.openId,
				name: this.primaryName,
				avatar: this.avatarUrl,
				email: this.primaryEmail,
				devices: this.devices,
				flags: {
					guest: this.flagGuest
				}
			}
		}
	}

	/**
	 *
	 *
	 * @static
	 * @param {DatabaseUser} data
	 * @returns {User}
	 * @memberof User
	 */
	public static createFromDatabase<T extends User>(data: DatabaseUser): ThisType<T> {
		const user = {
			_id: data._id,
			primaryName: data.name,
			avatarUrl: data.avatar,
			openId: data.openId,
			primaryEmail: data.email,
			devices: data.devices,
			flagGuest: data.flags ? data.flags.guest : false,
		};

		return new this(user);
	}

	/**
	 *
	 *
	 * @static
	 * @template T
	 * @param {GoogleOpenIdData} data
	 * @param {T} [extend=null]
	 * @returns {ThisType<T>}
	 * @memberof User
	 */
	public static createFromGoogle<T extends User>(data: GoogleOpenIdData, extend: T = null): ThisType<T> {
		const oidData = {
			openId: {
				google: data
			},
			primaryName: data.name,
			primaryEmail: data.email,
			avatarUrl: data.picture,
		};
		const user = extend ? Object.assign(extend, oidData) : oidData;

		return new this(user, true);
	}

	/**
	 *
	 *
	 * @static
	 * @template T
	 * @param {MicrosoftOpenIdData} data
	 * @param {T} [extend=null]
	 * @returns {ThisType<T>}
	 * @memberof User
	 */
	public static createFromMicrosoft<T extends User>(data: MicrosoftOpenIdData, extend: T = null): ThisType<T> {
		const oidData = {
			openId: { microsoft: data },
			primaryName: data.name,
			primaryEmail: data.email,
			// avatarUrl: data.picture,
		}
		const user = extend ? Object.assign(extend, oidData) : oidData;

		return new this(user, true);
	}

	/**
	 *
	 *
	 * @static
	 * @template T
	 * @param {SteamOpenIdData} data
	 * @param {T} [extend=null]
	 * @returns {ThisType<T>}
	 * @memberof User
	 */
	public static createFromSteam<T extends User>(data: SteamOpenIdData, extend: T = null): ThisType<T> {
		data.sub = data ? data.sub : data.steamid;
		const oidData = {
			openId: { steam: data },
			primaryName: data.personaname,
			// primaryEmail: data.email,
			avatarUrl: data.avatarfull,
		};
		const user = extend ? Object.assign(extend, oidData) : oidData;

		return new this(user, true);
	}

	/**
	 *
	 *
	 * @static
	 * @template T
	 * @param {FacebookOpenIdData} data
	 * @param {T} [extend=null]
	 * @returns {ThisType<T>}
	 * @memberof User
	 */
	public static createFromFacebook<T extends User>(data: FacebookOpenIdData, extend: T = null): ThisType<T> {
		const oidData = {
			openId: { facebook: data, },
			primaryName: data.profile.name,
			// primaryEmail: data.email,
			avatarUrl: data.profile.picture.data.url,
		};
		const user = extend ? Object.assign(extend, oidData) : oidData;

		return new this(user, true);
	}

	/**
	 *
	 *
	 * @static
	 * @template T
	 * @param {TwitchOpenIdData} data
	 * @param {T} [extend=null]
	 * @returns {ThisType<T>}
	 * @memberof User
	 */
	public static createFromTwitch<T extends User>(data: TwitchOpenIdData, extend: T = null): ThisType<T> {
		const oidData = {
			openId: { twitch: data },
			primaryName: data.preferred_username,
			primaryEmail: data.email,
			avatarUrl: data.picture,
		};
		const user = extend ? Object.assign(extend, oidData) : oidData;

		return new this(user, true);
	}
}
