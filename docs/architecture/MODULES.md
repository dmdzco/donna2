# Donna Modular Architecture

> **Status:** HISTORICAL REFERENCE ONLY
>
> This document describes a planned modular architecture that was **not implemented**. The actual Donna codebase uses a simpler, direct architecture documented in [OVERVIEW.md](./OVERVIEW.md).
>
> Keeping this document for reference on potential future refactoring patterns.

---

This guide explains a proposed modular architecture design that was planned for Phase C (Milestones 11-15).

---

## Overview

The full Donna architecture uses **independent modules** that can be:
- Tested in isolation
- Swapped without affecting others
- Deployed separately
- Developed in parallel

## Module Reference

### ✅ 1. Senior Profiles Module
**Location**: `modules/senior-profiles/`
**Purpose**: Manage elderly individual profiles and preferences
**Interface**: `ISeniorProfiles`

```typescript
import { container } from './config/dependency-injection';
import type { ISeniorProfiles } from '@donna/shared/interfaces';

const seniorProfiles = container.get<ISeniorProfiles>('SeniorProfiles');

// Create
const senior = await seniorProfiles.create(caregiverId, {
  name: 'John Doe',
  phone: '+1234567890',
  interests: ['gardening', 'cooking'],
});

// List
const seniors = await seniorProfiles.list(caregiverId);

// Update
await seniorProfiles.update(seniorId, { interests: ['gardening', 'music'] });
```

### ✅ 2. LLM Conversation Engine
**Location**: `modules/llm-conversation/`
**Purpose**: Generate Donna's conversational responses
**Interface**: `IConversationEngine`

```typescript
const llmConversation = container.get<IConversationEngine>('LLMConversation');

const response = await llmConversation.generateResponse({
  senior,
  userMessage: "How are you today?",
  conversationHistory: [],
  context: {
    pendingReminders: reminders,
    recentNews: newsItems,
  },
});

console.log(response); // Donna's empathetic response
```

### ✅ 3. Skills System
**Location**: `modules/skills-system/`
**Purpose**: Pluggable capabilities for Donna
**Interface**: `ISkillsSystem`

```typescript
const skillsSystem = container.get<ISkillsSystem>('SkillsSystem');

// Execute news search skill
const result = await skillsSystem.execute('news-search', {
  senior,
  maxItems: 3,
});

console.log(result.data); // Array of NewsItem[]

// Execute companionship skill
const topics = await skillsSystem.execute('companionship', {
  senior,
  category: 'memories',
});

console.log(topics.data.topics); // Conversation starters
```

**Built-in Skills**:
- ✅ `news-search` - Personalized news for seniors
- ✅ `companionship` - Conversation starters

**Easy to add new skills**:
```typescript
class WeatherSkill implements Skill {
  name = 'weather';
  description = 'Get local weather forecast';
  version = '1.0.0';

  async execute(params: SkillParams): Promise<SkillResult> {
    // Fetch weather for senior.locationCity
    return { success: true, data: weatherData };
  }
}

skillsSystem.register(new WeatherSkill());
```

### ✅ 4. Anthropic Adapter
**Location**: `adapters/anthropic/`
**Purpose**: Abstract Anthropic Claude API
**Interface**: `IAnthropicAdapter`

```typescript
const anthropic = container.get<IAnthropicAdapter>('AnthropicAdapter');

// Chat
const response = await anthropic.chat(
  [{ role: 'user', content: 'Hello!' }],
  'You are Donna, a friendly AI companion.',
  { maxTokens: 300 }
);

// Stream
for await (const chunk of anthropic.chatStream(messages, system)) {
  process.stdout.write(chunk);
}
```

---

## 🔧 How to Use Modules

### 1. Get Module from Container

```typescript
import { container } from '../config/dependency-injection';
import type { ISeniorProfiles } from '@donna/shared/interfaces';

const seniorProfiles = container.get<ISeniorProfiles>('SeniorProfiles');
```

### 2. Call Module Methods

```typescript
// Modules only expose their interface - implementation is hidden
const senior = await seniorProfiles.getById(seniorId);
```

### 3. Never Import Modules Directly

```typescript
// ❌ BAD: Direct import
import { SeniorProfilesService } from '../modules/senior-profiles/src/service';

// ✅ GOOD: Get from container
const seniorProfiles = container.get<ISeniorProfiles>('SeniorProfiles');
```

---

## 🧪 Testing Modules

Each module can be tested in isolation:

```typescript
// test/senior-profiles.test.ts
import { SeniorProfilesService } from '../modules/senior-profiles/src/service';
import { ISeniorRepository } from '../modules/senior-profiles/src/repository';

describe('SeniorProfilesService', () => {
  let service: SeniorProfilesService;
  let mockRepository: ISeniorRepository;

  beforeEach(() => {
    // Mock the repository
    mockRepository = {
      create: jest.fn().mockResolvedValue(mockSenior),
      findById: jest.fn().mockResolvedValue(mockSenior),
      // ... other methods
    };

    service = new SeniorProfilesService(mockRepository);
  });

  it('should create a senior', async () => {
    const senior = await service.create('caregiver-1', {
      name: 'Test',
      phone: '+1234567890',
    });

    expect(senior.name).toBe('Test');
    expect(mockRepository.create).toHaveBeenCalled();
  });
});
```

---

## 🔌 Swapping Implementations

Want to switch from PostgreSQL to MongoDB? Just swap the repository:

```typescript
// Create MongoDB repository that implements ISeniorRepository
class MongoSeniorRepository implements ISeniorRepository {
  async create(caregiverId: string, data: SeniorData): Promise<Senior> {
    // MongoDB implementation
  }
  // ... other methods
}

// In dependency injection config
const mongoRepo = new MongoSeniorRepository(mongoClient);
const seniorProfiles = new SeniorProfilesService(mongoRepo);
container.set('SeniorProfiles', seniorProfiles);

// All routes and other modules work without any changes!
```

Want to switch from Claude to OpenAI?

```typescript
// Create OpenAI adapter that implements IAnthropicAdapter (or rename interface to ILLMAdapter)
class OpenAIAdapter implements ILLMAdapter {
  async chat(messages: LLMMessage[], system?: string): Promise<string> {
    // OpenAI implementation
  }
}

container.set('LLMAdapter', new OpenAIAdapter(config));

// LLMConversationService works without changes!
```

---

## 📁 Directory Structure

```
donna/
├── modules/                        # Business modules
│   ├── senior-profiles/
│   │   ├── src/
│   │   │   ├── service.ts         # Implements ISeniorProfiles
│   │   │   ├── repository.ts      # Database access
│   │   │   └── index.ts           # Exports
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── llm-conversation/
│   │   ├── src/
│   │   │   ├── service.ts         # Implements IConversationEngine
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── skills-system/
│       ├── src/
│       │   ├── registry.ts        # Implements ISkillsSystem
│       │   ├── skills/
│       │   │   ├── news-search.skill.ts
│       │   │   └── companionship.skill.ts
│       │   └── index.ts
│       └── package.json
│
├── adapters/                       # External service adapters
│   ├── anthropic/
│   │   ├── src/
│   │   │   ├── adapter.ts         # Implements IAnthropicAdapter
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── twilio/                     # TODO
│   ├── deepgram/                   # TODO
│   └── elevenlabs/                 # TODO
│
├── packages/
│   └── shared/
│       └── src/
│           └── interfaces/
│               └── module-interfaces.ts  # All interface definitions
│
├── config/
│   └── dependency-injection.ts    # Wire everything together
│
├── apps/
│   └── api/
│       └── src/
│           └── routes/            # Thin HTTP handlers
│
└── docs/
    ├── ARCHITECTURE_V2.md         # Full architecture spec
    ├── MIGRATION_GUIDE.md         # How to migrate existing code
    ├── EXAMPLE_ROUTE_USAGE.md     # Before/after route examples
    └── MODULES_README.md          # This file
```

---

## 🚀 Adding a New Module

1. **Create directory**:
```bash
mkdir -p modules/my-module/{src,tests}
```

2. **Define interface** in `packages/shared/src/interfaces/module-interfaces.ts`:
```typescript
export interface IMyModule {
  doSomething(param: string): Promise<Result>;
}
```

3. **Implement module**:
```typescript
// modules/my-module/src/service.ts
import { IMyModule } from '@donna/shared/interfaces';

export class MyModuleService implements IMyModule {
  async doSomething(param: string): Promise<Result> {
    // Implementation
  }
}
```

4. **Register in container**:
```typescript
// config/dependency-injection.ts
const myModule = new MyModuleService(dependencies);
this.set('MyModule', myModule);
```

5. **Use anywhere**:
```typescript
const myModule = container.get<IMyModule>('MyModule');
await myModule.doSomething('test');
```

---

## 🎓 Key Principles

### 1. Depend on Interfaces, Not Implementations
```typescript
// ✅ GOOD
constructor(private seniorProfiles: ISeniorProfiles) {}

// ❌ BAD
constructor(private seniorProfiles: SeniorProfilesService) {}
```

### 2. No Cross-Module Imports
```typescript
// ❌ BAD
import { LLMConversationService } from '../llm-conversation/src/service';

// ✅ GOOD
import type { IConversationEngine } from '@donna/shared/interfaces';
constructor(private llmConversation: IConversationEngine) {}
```

### 3. Single Responsibility
Each module does ONE thing well. If a module has multiple responsibilities, split it!

### 4. No Side Effects in Modules
Modules should be pure functions of their inputs. Store state in databases, not in module memory.

---

## Target Architecture (Phase C)

This modular architecture is the goal for Milestones 11-15. The modules will be built incrementally:

| Module | Milestone | Purpose |
|--------|-----------|---------|
| Senior Profiles | 7 | CRUD for senior profiles |
| Reminder Management | 8 | Medication/appointment reminders |
| Scheduler | 9 | Automated call scheduling |
| Conversation Manager | 11 | Conversation storage |
| Call Orchestrator | 11 | Call lifecycle management |
| Voice Pipeline | 11 | STT/TTS orchestration |
| LLM Conversation | 11 | Claude conversation engine |
| Observer Agent | 12 | Conversation quality analysis |
| Memory & Context | 13 | Long-term memory |
| Analytics | 14 | Usage metrics & insights |

---

## Adding New Modules

When the architecture is ready (Phase C):

1. Define interface first
2. Implement module in `modules/`
3. Add tests
4. Register in DI container
5. Update routes if needed

---

## Getting Help

- **Build roadmap**: See `docs/INCREMENTAL_BUILD_GUIDE.md`
- **Architecture overview**: See `docs/architecture/OVERVIEW.md`
- **Deployment**: See `docs/guides/DEPLOYMENT_PLAN.md`

---

## Benefits

- **Interchangeable**: Swap any module or adapter
- **Testable**: Mock any dependency
- **Maintainable**: Changes isolated to one module
- **Scalable**: Each module can scale independently
