# Basic Inventory App Starter

Laravel API + Expo React Native starter kit.

## What is included

- `inventory-api/` - Laravel 12 inventory API
- `mobile/` - Expo React Native app source
- `API_TEST.http` - sample API requests

## Features

- Login with Laravel Sanctum token authentication
- Categories
- Products
- Stock in / stock out
- Stock movement history
- Dashboard summary
- Low-stock indicator

## Requirements

- PHP 8.2+
- Composer
- Node.js 22.13+ or 24.3+
- npm
- SQLite, MySQL, or PostgreSQL

## Fast start

### 1. Unzip and enter the folder

```bash
unzip inventory-basic-starter.zip
cd inventory-basic-starter
```

### 2. Set up the Laravel API

```bash
cd inventory-api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

Default API URL:

```text
http://127.0.0.1:8000/api
```

### 3. Start the Expo app

Open a second terminal:

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

## API URL note

The mobile app reads:

```text
EXPO_PUBLIC_API_URL=
```

Set it based on your device:

### Android emulator

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api
```

### iOS simulator

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api
```

### Physical phone on same Wi-Fi

Use your computer LAN IP, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.105:8000/api
```

Then run the API server on all interfaces:

```bash
cd inventory-api
php artisan serve --host=0.0.0.0 --port=8000
```

## Test login

```text
Email: admin@example.com
Password: password
```

## Main API endpoints

```text
POST   /api/login
GET    /api/me
POST   /api/logout

GET    /api/categories
POST   /api/categories

GET    /api/products
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}

POST   /api/stock/in
POST   /api/stock/out
GET    /api/stock/movements

GET    /api/dashboard
```

## Development notes

- The backend is already merged into `inventory-api`; there is no separate overlay setup step.
- Laravel 12 supports PHP 8.2+, including PHP 8.2.30.
- The mobile app uses Expo SDK 57, React Native 0.86, and React 19.2. Use Expo Go for SDK 57 on your phone.
- If dependency folders are missing or stale, rerun `composer install` in `inventory-api` and `npm install` in `mobile`.

To refresh mobile dependencies:

```bash
cd mobile
npm ci
npx expo install --check
npm start -- --clear
```

If Expo Go reports an SDK mismatch, stop the running Expo server, refresh dependencies with the commands above, and scan the new QR code. The app and Expo Go must use the same SDK version. See the [Expo SDK upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
