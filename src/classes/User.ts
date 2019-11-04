import { DatabaseUser } from "../models/DatabaseUser";
import { GoogleOpenIdData, MicrosoftOpenIdData, OpenIdData, SteamOpenIdData, FacebookOpenIdData, TwitchOpenIdData } from "../models/OpenIdData";
import uuidv4 = require("uuid/v4");

export class User {
	protected _id: string = "_new_";
	protected openId: OpenIdData = {};

	protected primaryName: string = "";
	protected avatarUrl: string = "";
	protected primaryEmail: string = "";

    /**
     * Creates an instance of User.
     * @memberof User
     */
	constructor() {
		this._id = uuidv4();
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
			avatar: this.avatarUrl
		}
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
					google: { sub: this.openId.google.sub },
					microsoft: { sub: this.openId.microsoft.sub },
					steam: { steamid: this.openId.steam.steamid },
				},
				name: this.primaryName,
				avatar: this.avatarUrl
			}
		} else {
			return {
				_id: this._id,
				openId: this.openId,
				name: this.primaryName,
				avatar: this.avatarUrl
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
	public static createFromDatabase(data: DatabaseUser): User {
		const user = new User();
		user._id = data._id;
		user.primaryName = data.name;
		user.avatarUrl = data.avatar;
		user.openId = data.openId;

		return user;
	}

	/**
	 *
	 *
	 * @static
	 * @param {GoogleOpenIdData} data
	 * @returns {User}
	 * @memberof User
	 */
	public static createFromGoogle(data: GoogleOpenIdData): User {
		const user = new User();
		user.openId.google = data;
		user.primaryName = data.name;
		user.primaryEmail = data.email;
		user.avatarUrl = data.picture;

		return user;
	}

	/**
	 *
	 *
	 * @static
	 * @param {MicrosoftOpenIdData} data
	 * @returns {User}
	 * @memberof User
	 */
	public static createFromMicrosoft(data: MicrosoftOpenIdData): User {
		const user = new User();
		user.openId.microsoft = data;
		user.primaryName = data.name;
		user.primaryEmail = data.email;
		// user.avatarUrl = data.picture;

		return user;
	}

	/**
	 *
	 *
	 * @static
	 * @param {SteamOpenIdData} data
	 * @returns {User}
	 * @memberof User
	 */
	public static createFromSteam(data: SteamOpenIdData): User {
		const user = new User();
		user.openId.steam = data;
		user.primaryName = data.personaname;
		// user.primaryEmail = data.email;
		user.avatarUrl = data.avatarfull;

		return user;
	}

	/**
	 *
	 *
	 * @static
	 * @param {FacebookOpenIdData} data
	 * @returns {User}
	 * @memberof User
	 */
	public static createFromFacebook(data: FacebookOpenIdData): User {
		const user = new User();
		user.openId.facebook = data;
		user.primaryName = data.profile.name;
		// user.primaryEmail = data.email;
		user.avatarUrl = data.profile.picture.data.url;

		return user;
	}

	/**
	 *
	 *
	 * @static
	 * @param {TwitchOpenIdData} data
	 * @returns {User}
	 * @memberof User
	 */
	public static createFromTwitch(data: TwitchOpenIdData): User {
		const user = new User();
		user.openId.twitch = data;
		user.primaryName = data.preferred_username;
		user.primaryEmail = data.email;
		user.avatarUrl = data.picture;

		return user;
	}
}
