import { User } from "@/classes/User";
import { OpenIdServiceIndex } from "../enums/OpenIdServiceIndex";

export interface StorageInterface<UC extends User> {
    fetchUserById(id: string): UC;
    fetchUserByOpenId(id: string, service: OpenIdServiceIndex): UC;
    fetchUserByAccessToken(token: string): UC;
    saveUser(item: UC): UC;
}