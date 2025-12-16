#!/usr/bin/env node

const { runCli } = require('../src/cli/run');

runCli().catch((err) => {
  process.exitCode = 1;
  console.error(err?.stack || String(err));
});
