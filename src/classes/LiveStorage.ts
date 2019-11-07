import { Logger } from "@/lib/tools/Logger";
import { DatabaseUser, OpenIdServiceIndex, StorageInterface } from "@/models";
import { User } from "./User";

export class LiveStorage implements StorageInterface<User> {

    protected UserStorage: Map<string, DatabaseUser> = new Map<string, DatabaseUser>();

    constructor(private userClassRef?: typeof User) {

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
            return this.userClassRef.createFromDatabase(this.UserStorage.get(id));
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
            return this.userClassRef.createFromDatabase(user1);
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
        this.UserStorage.set(item.id, item.exportToDatabase());
        return item;
    }


}
