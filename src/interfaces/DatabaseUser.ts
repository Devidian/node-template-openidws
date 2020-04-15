import { OpenIdData } from "./OpenIdData";
import { UserDevice } from "./UserDevice";

export interface DatabaseUser {
	_id: string;
	openId: OpenIdData;
	name: string;
	avatar: string;
	email: string;
	devices: UserDevice[];
	flags: {
		guest: boolean
	},
}
