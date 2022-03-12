const log = require('loglevel');
const convertStringToUuid = require('uuid-by-string');

log.setDefaultLevel('info');

const device_identifier = '3581468e31e2c74a';
const planter_identifier = '0784589075';

const sessionId = convertStringToUuid(device_identifier + planter_identifier);
log.info(device_identifier);
log.info(planter_identifier);
log.info(sessionId);
