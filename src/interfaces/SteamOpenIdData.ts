import { GeneralOpenIdData } from "./GeneralOpenIdData";
export interface SteamOpenIdData extends GeneralOpenIdData {
    steamid?: string;
    communityvisibilitystate?: number;
    profilestate?: number;
    personaname?: string;
    lastlogoff?: number;
    commentpermission?: number;
    profileurl?: string;
    avatar?: string;
    avatarmedium?: string;
    avatarfull?: string;
    personastate?: number;
    realname?: string;
    primaryclanid?: string;
    timecreated?: number;
    personastateflags?: number;
    loccountrycode?: string;
    locstatecode?: string;
    loccityid?: number;
}
