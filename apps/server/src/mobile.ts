// Entry point inside the Android app. The native side starts Node with:
//   node main.js <dataDir> <webDir> <port>
// mobile-boot must stay the first import: it sets up logging before anything else loads.
import { fail, step } from './mobile-boot.js';
import { startServer } from './server.js';

step('server code loaded');
startServer(step).catch(fail);
