# Project Rules

## File Output
- Save all generated markdown files to the `vibe/` directory by default
- Only use a different location when explicitly specified

## Code Changes
- When modifying source code, always update the corresponding test files in the same commit
- If no tests exist for the changed code, flag it and offer to create them

## Git
- Write all commit messages in English
- Use conventional commit format: `type(scope): description` (e.g. `feat(ui): add inventory panel`, `fix(save): resolve corrupted save file`)
- Keep commit messages concise: subject line under 72 characters

## Resource Limits
- Use at most 2 parallel subagents to minimize memory usage
- Prefer sequential execution over parallelism when the task is not time-critical

## Code Quality
- Add brief comments for complex logic; skip obvious code
- All new functions must include parameter and return type annotations
- Do not remove or modify existing comments without explicit approval

