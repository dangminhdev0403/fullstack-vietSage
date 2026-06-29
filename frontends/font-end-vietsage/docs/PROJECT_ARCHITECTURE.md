# Frontend Architecture

## Overview

Hotel management frontend built with:

- Next.js 16
- React 19
- TypeScript
- TanStack Query
- Zustand
- Tailwind CSS
- Axios

The app follows Next.js App Router architecture with separated routing, UI, service, resource, and state layers.

## Folder Structure

```
└── 📁font-end-vietsage
    └── 📁src
        └── 📁app
    └── 📁configs
    └── 📁providers
    └── 📁core
        └── 📁http
        └── 📁hooks
        └── 📁websocket
        └── 📁storage
        └── 📁query
        └── 📁utils
    └── 📁components
        └── 📁layouts
        └── 📁ui
        └── 📁shared
    └── 📁public
    └── 📁features
        └── 📁[features-name]
            └── 📁service
            └── 📁hooks
            └── 📁types
            └── 📁schemas

```
## Application structure

- `app/` contains App Router route segments, layouts, pages, and route groups for guest, staff, and admin flows.
- `components/` contains reusable UI components and shared presentation logic across the application.
- `providers/` contains application-level providers such as TanStack Query, theme configuration, and websocket providers.
- `core/` contains infrastructure and cross-cutting concerns shared across the system.
- `features/` contains business-domain modules with isolated API, hooks, validation schemas, and domain types.
- `configs/` contains environment configuration and application settings.
- `public/` contains static assets such as images, icons, and branding resources.

## Core layer

Infrastructure modules are grouped inside `core/`:

- `core/http` contains shared HTTP transport concerns (client/server request wrappers, authentication headers, refresh boundaries, error handling, and response logging).
- `core/hooks` contains generic reusable hooks not tied to business domains.
- `core/websocket` contains realtime socket connection setup and websocket utilities.
- `core/storage` contains browser storage abstractions and session persistence utilities.
- `core/query` contains TanStack Query configuration and query client initialization.
- `core/utils` contains generic helper functions and shared utility logic.

## Feature architecture

Each business domain is isolated under `features/`:

```txt
features/
└── [feature-name]
    ├── service/
    ├── hooks/
    ├── types/
    └── schemas/
```

Definitions:

- `service/` contains API communication and feature-specific backend interaction logic.
- `hooks/` contains feature-level custom hooks and state orchestration.
- `types/` contains TypeScript interfaces and domain models.
- `schemas/` contains runtime validation schemas using Zod.

This structure keeps business logic encapsulated and avoids coupling across unrelated modules.

## Authentication and session model
- Authentication is implemented using JWT-based authentication.
- Auth uses NextAuth v5 (`config/authentication/auth.ts`) with credentials flow.
- Application-level session state is initialized through root providers.
- Protected route access is handled through middleware and route guards.
- Authentication state can be consumed through shared hooks and storage abstractions.

## Data and API layering

Data flow follows the architecture below:

```txt
UI Component
      ↓
Feature Hook
      ↓
Feature Service
      ↓
Core HTTP Transport (`httpClient` / `httpServer`)
      ↓
Backend API
```

Responsibilities:

- UI components should only handle rendering and user interaction.
- Hooks should orchestrate business behavior and query state.
- Services should contain API request logic only.
- Core HTTP transports should handle transport concerns only.
- Client-side and public backend requests must use `src/core/http/http-client.ts`.
- Server-side authenticated backend requests must use `src/core/http/http-server.ts`.
- Raw `fetch`/`axios` calls must not be introduced in pages, layouts, UI components, or feature services.
- Refresh plus Auth.js cookie persistence must stay inside Route Handlers or Server Actions; SSR/Server Component data loading must not rotate refresh tokens.

This separation ensures predictable data flow and reduces coupling between presentation and infrastructure layers.
