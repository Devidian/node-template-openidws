import { Logger } from "@/lib/tools/Logger";
import { DatabaseUser, OpenIdServiceIndex, StorageInterface } from "@/models";
import { User } from "./User";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { rootDir } from "@/config";

export class LiveStorage implements StorageInterface<User> {

	protected UserStorage: Map<string, DatabaseUser> = new Map<string, DatabaseUser>();
	// Store guest logins seperately
	protected GuestStorage: Map<string, DatabaseUser> = new Map<string, DatabaseUser>();

	protected get combinedStorageArray(): DatabaseUser[] {
		const guests = Array.from(this.GuestStorage.values());
		const registered = Array.from(this.UserStorage.values());
		const all = [...guests, ...registered];
		return all;
	}

	constructor() {

	}

    /**
     *
     *
     * @template T
     * @param {string} id
     * @returns {T}
     * @memberof LiveStorage
     */
	public fetchUserById(id: string): User {
		if (this.UserStorage.has(id)) {
			return <User>User.createFromDatabase(this.UserStorage.get(id));
		} else if (this.GuestStorage.has(id)) {
			return <User>User.createFromDatabase(this.GuestStorage.get(id));
		} else {
			return null;
		}
	}

    /**
     *
     *
     * @template T
     * @param {string} id
     * @param {OpenIdServiceIndex} service
     * @returns {T}
     * @memberof LiveStorage
     */
	public fetchUserByOpenId(id: string, service: OpenIdServiceIndex): User {
		const [user1, ...other] = Array.from(this.UserStorage.values()).filter((u: DatabaseUser) => u.openId[service].sub === id);
		if (user1) {
			if (other.length > 0) {
				Logger(511, "fetchUserByOpenId", `Found multiple accounts for ${service} / ${id}`);
			}
			return <User>User.createFromDatabase(user1);
		} else {
			return null;
		}
	}

    /**
     *
     *
     * @param {string} token
     * @returns {User}
     * @memberof LiveStorage
     */
	public fetchUserByAccessToken(token: string): User {
		const matches = this.combinedStorageArray.filter((u: DatabaseUser) => u.devices.filter((v) => v.token === token).length > 0);
		const [user1, ...other] = matches;
		if (user1) {
			if (other.length > 0) {
				Logger(511, "fetchUserByAccessToken", `Found multiple accounts for ${token}, revoke access due to security reasons`);
				matches.forEach((du) => {
					const matchIndex = du.devices.findIndex(v => v.token === token);
					const debugDeleted = du.devices.splice(matchIndex, 1);
					Logger(0, "fetchUserByAccessToken", "removed", debugDeleted, "userNow", this.UserStorage.get(du._id));
				});
				return null;
			} else {
				return <User>User.createFromDatabase(user1);
			}
		} else {
			return null;
		}
	}

    /**
     *
     *
     * @param {User} item
     * @returns {User}
     * @memberof LiveStorage
     */
	public saveUser(item: User): User {
		if (item.isGuest) {
			this.GuestStorage.set(item.id, item.exportToDatabase());
		} else {
			this.GuestStorage.delete(item.id); // remove from guest if it was a new user that has registred
			this.UserStorage.set(item.id, item.exportToDatabase());
		}
		return item;
	}

    /**
     *
     *
     * @memberof LiveStorage
     */
	public loadFromDisk(): void {
		try {
			const filePath = resolve(rootDir, "storage.local.json");
			const fx = existsSync(filePath);
			if (!fx) {
				return;
			}
			const rawData = readFileSync(filePath).toString("utf-8");
			const diskData: { user: DatabaseUser[], guests: DatabaseUser[] } = JSON.parse(rawData);

			!diskData.user ? null : diskData.user.forEach(user => {
				this.UserStorage.set(user._id, user);
			});

			!diskData.guests ? null : diskData.guests.forEach(user => {
				this.GuestStorage.set(user._id, user);
			});

			User.guestCounter = 1 + this.combinedStorageArray.length;
		} catch (error) {
			Logger(911, "loadFromDisk", error);
		}
	}

    /**
     *
     *
     * @memberof LiveStorage
     */
	public saveToDisk(): void {
		const filePath = resolve(rootDir, "storage.local.json");
		const diskData = {
			user: Array.from(this.UserStorage.values()),
			guests: Array.from(this.GuestStorage.values()),
		};

		try {
			writeFileSync(filePath, JSON.stringify(diskData, null, 2));
		} catch (error) {
			Logger(911, "saveToDisk", error);
		}
	}
}
