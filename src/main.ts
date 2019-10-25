'use strict';
import { Master } from './classes/Master';
import { cfg } from './config';
import { Logger } from './lib/tools/Logger';
import { basename } from 'path';

Logger(100, basename(__filename), `Starting master-process of ${cfg.app.title}`);
process.title = cfg.app.title;

let M = new Master();