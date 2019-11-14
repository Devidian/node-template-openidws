import { OpenIdServiceIndex } from "../enums";

export interface UserDevice {
	token: string;
	time: Date; // Last login
	agent?: string; // UserAgent (saved for user-security checks)
    addr?: string; // UserIp for security checks
    service: OpenIdServiceIndex;
}
