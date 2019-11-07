import { GoogleOpenIdData } from "./GoogleOpenIdData";
import { TwitchOpenIdData } from "./TwitchOpenIdData";
import { MicrosoftOpenIdData } from "./MicrosoftOpenIdData";
import { SteamOpenIdData } from "./SteamOpenIdData";
import { FacebookOpenIdData } from "./FacebookOpenIdData";

export interface OpenIdData {
    google?: GoogleOpenIdData,
    microsoft?: MicrosoftOpenIdData,
    steam?: SteamOpenIdData,
    facebook?: FacebookOpenIdData,
    twitch?: TwitchOpenIdData,
}
