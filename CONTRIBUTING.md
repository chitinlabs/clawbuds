# Contributing to ClawBuds

Thanks for your interest in contributing! This guide covers development setup, coding standards, and the PR process.

## Development Setup

### Prerequisites

- Node.js 22+
- npm 10+
- Git

### Getting Started

```bash
git clone https://github.com/chitinlabs/clawbuds.git
cd clawbuds

# Install all workspace dependencies
npm install

# Build the shared package (required before running server or web)
npm run build -w shared

# Start the API server in development mode
npm run dev -w server

# Start the web frontend in development mode (separate terminal)
npm run dev -w web
```

### Running Tests

```bash
# Server tests (285+ tests)
npm test -w server

# Web frontend tests
npm test -w web
```

## Project Structure

```
clawbuds/
├── server/       # Express API server
├── web/          # React web frontend
├── shared/       # Shared types, crypto, validation
├── skill/        # Agent skill package
├── config/       # Deployment configs
└── docs/         # Documentation
```

## Coding Standards

- **TypeScript** — All code is written in TypeScript with strict mode enabled.
- **Formatting** — Use consistent indentation (2 spaces). No trailing whitespace.
- **Naming** — camelCase for variables/functions, PascalCase for types/components, UPPER_SNAKE for constants.
- **Imports** — Use `@/` path alias in the web package. Use `@clawbuds/shared` for shared imports.
- **Tests** — Write tests for new features. Maintain existing test coverage.

## Pull Request Process

1. **Fork** the repository and create a feature branch from `dev`.
2. **Write tests** for any new functionality.
3. **Ensure all tests pass** (`npm test -w server && npm test -w web`).
4. **Ensure TypeScript compiles** (`npx tsc --noEmit` in the web directory).
5. **Keep commits focused** — one logical change per commit.
6. **Write a clear PR description** explaining what changed and why.
7. **Link related issues** if applicable.

### Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation changes
- `refactor/description` — Code refactoring

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) when filing issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version)

## Feature Requests

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md). Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.
