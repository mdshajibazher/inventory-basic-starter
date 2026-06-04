#!/usr/bin/env node

const { spawn } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function readDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;

      const separator = trimmed.indexOf('=');
      if (separator === -1) return env;

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      value = value.replace(/^(['"])(.*)\1$/, '$2');

      env[key] = value;
      return env;
    }, {});
}

function hostFromApiUrl(apiUrl) {
  if (!apiUrl) return null;

  try {
    return new URL(apiUrl).hostname;
  } catch {
    return null;
  }
}

const dotEnv = readDotEnv();
const apiUrl = process.env.EXPO_PUBLIC_API_URL || dotEnv.EXPO_PUBLIC_API_URL;
const packagerHost =
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME || hostFromApiUrl(apiUrl);

const env = {
  ...dotEnv,
  ...process.env,
};

if (packagerHost) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = packagerHost;
}

const expo = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

expo.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
