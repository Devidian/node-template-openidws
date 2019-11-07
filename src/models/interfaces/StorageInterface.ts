import { User } from "@/classes/User";
import { OpenIdServiceIndex } from "../enums/OpenIdServiceIndex";

export interface StorageInterface<UC extends User> {
    fetchUserById(id: string): UC;
    fetchUserByOpenId(id: string, service: OpenIdServiceIndex): UC;
    saveUser(item: UC): UC;
}
