import { User } from "../classes/User";
import WebSocket = require("ws");
/**
 *
 *
 * @interface ExtendedWSClient
 * @extends {WebSocket}
 */
export interface ExtendedWSClient extends WebSocket {
	data: {
		user: User;
		[key: string]: any;
	};
	upgradeReq: any;
}
