# Committing

Try to stick to Conventional Commits:

- `type: short summary`
- or `type(scope): short summary`

#### Common types:

- `feat:` → new features
- `fix:` → bug fixes
- `docs:` → documentation changes
- `refactor:` → internal cleanup (no behavior change)
- `chore:` → for small project updates
- `test:` → tests

Keep it short and clear. Don't overthink it.

If it helps, include the issue number:

- `fix(embed): keep script output consistent (#6)`

#### Examples:

- `feat(settings): add auto backup include json option`
- `fix: prevent duplicate counter creation`
- `docs: clarify TRUST_PROXY usage`


## Before pushing

- Make sure it works locally
- Run any checks/tests if needed
- Keep commits focused (don’t mix unrelated stuff)
- Push with a clear message