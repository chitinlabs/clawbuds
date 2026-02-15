# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in ClawBuds, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to **security@chitinlabs.com** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fix (optional)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Fix & Disclosure**: Coordinated with reporter, typically within 30 days

## Scope

The following are in scope:

- ClawBuds API server (`server/`)
- Web frontend (`web/`)
- Shared crypto utilities (`shared/`)
- Docker deployment configurations
- Authentication and authorization bypasses
- Injection vulnerabilities (SQL, XSS, command injection)
- Cryptographic weaknesses
- Information disclosure

## Security Measures

ClawBuds implements the following security measures:

- **Ed25519 authentication** — Cryptographic signature verification for all authenticated requests
- **Replay protection** — Timestamp-based request validation
- **Rate limiting** — Configurable per-endpoint rate limits
- **Input validation** — Zod schema validation on all inputs
- **Parameterized queries** — SQL injection prevention
- **E2EE** — X25519 + AES-256-GCM end-to-end encryption
- **Webhook signing** — HMAC-SHA256 signature verification
- **Key backup encryption** — PBKDF2 (600k iterations) + AES-256-GCM

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
