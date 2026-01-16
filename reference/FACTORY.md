# Donna AI Factory - Coordination Hub

> **This file is the central coordination point for all agents.**
> Agents MUST read this before starting work and update it to claim tasks.

---

## 🚦 Current Status

| Agent | Status | Current Task | Branch | Last Update |
|-------|--------|--------------|--------|-------------|
| Agent-1 | 🟢 Idle | - | `feat/agent-1-workspace` | - |
| Agent-2 | 🟢 Idle | - | `feat/agent-2-workspace` | - |
| Agent-3 | 🟢 Idle | - | `feat/agent-3-workspace` | - |
| Agent-4 | 🟢 Idle | - | `feat/agent-4-workspace` | - |
| Agent-5 | 🟢 Idle | - | `feat/agent-5-workspace` | - |

Status Legend: 🟢 Idle | 🔵 Working | 🟡 Blocked | 🔴 Error | ✅ Done

---

## 📋 Task Queue

### High Priority
<!-- Add tasks here. Agents claim by moving to "In Progress" -->

### Normal Priority

### Low Priority

---

## 🔒 Claimed Files & Modules

> **CRITICAL: Before editing ANY file, check this list. If claimed, DO NOT TOUCH.**

| File/Module | Claimed By | Purpose | Until |
|-------------|------------|---------|-------|
| _example: `src/auth/*`_ | _Agent-1_ | _Refactoring auth flow_ | _completion_ |

---

## 📝 Work Log

<!-- Agents append their progress here. Newest at top. -->

### [Date will be added by agents]

---

## 💬 Agent Messages

<!-- Agents can leave notes for each other or the operator here -->

---

## 📚 Shared Context

### Project Overview
<!-- Operator fills this in with context all agents should know -->

### Architecture Decisions
<!-- Document decisions so all agents follow same patterns -->

### Code Style Notes
<!-- Any project-specific conventions -->

---

## ⚠️ Do Not Touch

> Files/areas that are off-limits to ALL agents

- `.env` files (secrets)
- `package-lock.json` (let npm handle it)
- Database migration files (requires coordination)

---

## 🔄 Sync Protocol

Agents MUST follow this protocol:

1. **Before starting work:**
   ```bash
   git fetch origin
   git pull origin main --rebase
   ```

2. **Claim your task:**
   - Update the status table above
   - Add files to "Claimed Files" section
   - Commit: `git commit -m "chore: Agent-X claiming task [description]"`
   - Push: `git push origin <your-branch>`

3. **During work:**
   - Commit frequently with clear messages
   - Update Work Log section periodically

4. **Before touching shared files:**
   - Pull latest FACTORY.md: `git checkout main -- FACTORY.md`
   - Check if file is claimed
   - If not claimed, claim it first, push, then proceed

5. **When finished:**
   - Update status to ✅ Done
   - Remove file claims
   - Push final commits
   - Optionally create PR

---

*Last factory reset: [DATE]*
