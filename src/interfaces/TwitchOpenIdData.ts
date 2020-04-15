import { GeneralOpenIdData } from "./GeneralOpenIdData";
export interface TwitchOpenIdData extends GeneralOpenIdData {
    email?: string;
    picture?: string;
    preferred_username?: string;
}
