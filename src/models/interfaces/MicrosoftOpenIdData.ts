import { GeneralOpenIdData } from "./GeneralOpenIdData";
export interface MicrosoftOpenIdData extends GeneralOpenIdData {
    email?: string;
    name?: string;
    preferred_username?: string;
}
