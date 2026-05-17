#!/usr/bin/env bash
set -e

rm -rf node_modules package-lock.json
npm install
npx expo install --fix
npx expo start --clear
