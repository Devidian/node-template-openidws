import { GeneralOpenIdData } from "./GeneralOpenIdData";
export interface GoogleOpenIdData extends GeneralOpenIdData {
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    email?: string;
    email_verified?: boolean;
    locale?: string;
    hd?: string;
}
