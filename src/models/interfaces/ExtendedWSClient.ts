import { User } from "@/classes/User";
import WebSocket = require("ws");
/**
 *
 *
 * @interface ExtendedWSClient
 * @extends {WebSocket}
 */
export interface ExtendedWSClient<UC extends User>  extends WebSocket {
	data: {
		user: UC;
		[key: string]: any;
		id: string;
	};
	upgradeReq: any;
}
