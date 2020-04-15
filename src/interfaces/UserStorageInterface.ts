import { User } from "@/models/User";
import { OpenIdServiceIndex } from "../enums/OpenIdServiceIndex";

export interface UserStorageInterface<UC extends User> {
    fetchUserById(id: string): UC;
    fetchUserByOpenId(id: string, service: OpenIdServiceIndex): UC;
    fetchUserByAccessToken(token: string): UC;
    saveUser(item: UC): UC;
}
