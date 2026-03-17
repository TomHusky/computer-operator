#!/usr/bin/env node

const { getScreenInfo } = require('./screen_utils');

console.log(JSON.stringify(getScreenInfo(), null, 2));
