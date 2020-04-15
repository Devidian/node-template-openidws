import { GeneralOpenIdData } from "./GeneralOpenIdData";
import { FacebookOpenIdProfile } from "./FacebookOpenIdProfile";
export interface FacebookOpenIdData extends GeneralOpenIdData {
    access_token: string;
    token_type: string;
    expires_in: number;
    profile: FacebookOpenIdProfile;
}
