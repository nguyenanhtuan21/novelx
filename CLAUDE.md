## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `nguyenanhtuan21/novelx` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Domain docs use a single-context layout: root `CONTEXT.md` plus root `docs/adr/`. See `docs/agents/domain.md`.

### Custome rules
- Speak Vietnamese for all case 
- Create branch before implement a feature , like 'feature/[featurename]'
- Compare and merge to main when implement done
- Done: All test case green , when task has UI, alway use playwright MCP to test feature
- Hard follow Clean Architecture , SOLID , YAGNI, KISS
- Don't over engineering !