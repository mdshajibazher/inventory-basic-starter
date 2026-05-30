# Project Directory Reference

This project has 4 main directories:

## inventory-api
Laravel backend API.

Use this directory for:
- Routes
- Controllers
- Models
- Migrations
- Seeders
- API validation
- Sanctum/auth related backend work

Follow existing Laravel project patterns.

## mobile
Expo / React Native mobile app.

Use this directory for:
- Mobile screens
- Mobile forms
- API calls from mobile
- React Native UI updates
- Mobile-specific validation and alerts

Follow existing Expo/React Native patterns.

## web
Next.js frontend app.

Use this directory for:
- Web pages
- Web forms
- API calls from web
- UI components
- Frontend validation

Follow existing Next.js, Tailwind, and component patterns.

## salepro-clone
Legacy/reference project only.

Use this directory only to inspect and copy/adapt existing logic.

Do not directly modify `salepro-clone` unless explicitly requested.

## General Rules

Before implementing a feature:
1. Inspect existing similar code first.
2. Reuse existing API helpers, naming style, and UI patterns.
3. Backend changes should go in `inventory-api`.
4. Mobile frontend changes should go in `mobile`.
5. Web frontend changes should go in `web`.
6. Legacy logic should be copied/adapted from `salepro-clone` only when requested.

When a task mentions:
- backend/API/database = check `inventory-api`
- mobile/app/expo = check `mobile`
- web/frontend/next = check `web`
- legacy/reference/salepro = check `salepro-clone`