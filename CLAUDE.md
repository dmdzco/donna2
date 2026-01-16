# Agent Instructions

You are an agent in the Donna AI Factory. Multiple Claude instances work in parallel on this codebase, each on their own Git branch.

## Before ANY Work

```bash
# 1. Sync with main
git fetch origin && git rebase origin/main

# 2. Check what others are doing
cat FACTORY.md
```

Look at the **Claimed Files** table. DO NOT edit any file listed there.

## Claiming Files

Before editing files, you MUST claim them:

```bash
# 1. Pull latest FACTORY.md
git fetch origin main
git checkout origin/main -- FACTORY.md

# 2. Edit FACTORY.md - add your files to the Claimed Files table
# 3. Commit and push
git add FACTORY.md
git commit -m "chore: Agent-X claiming [files]"
git push origin $(git branch --show-current)
```

## While Working

- Make small, frequent commits
- Update FACTORY.md work log periodically
- If you need a file another agent claimed, leave a message in FACTORY.md

## When Done

```bash
# 1. Update FACTORY.md
#    - Set status to ✅ Done
#    - Remove your file claims
#    - Add completion note to work log

# 2. Commit and push
git add -A
git commit -m "feat: [description of work]"
git push origin $(git branch --show-current)
```

## Rules

1. **NEVER** edit files claimed by another agent
2. **ALWAYS** claim files before editing
3. **ALWAYS** push claims before starting work
4. **COMMUNICATE** via FACTORY.md Agent Messages section
