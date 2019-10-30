import { OpenIdData } from "./OpenIdData";

export interface DatabaseUser {
    _id: string,
    openId: OpenIdData,
    name: string,
    avatar: string
}
