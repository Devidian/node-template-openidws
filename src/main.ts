'use strict';
import 'module-alias/register';
import { basename } from 'path';
import { Master } from '@/classes/Master';
import { cfg } from '@/config';
import { Logger } from '@/lib/tools/Logger';

Logger(100, basename(__filename), `Starting master-process of ${cfg.app.title}`);
process.title = cfg.app.title;

let M = new Master();
