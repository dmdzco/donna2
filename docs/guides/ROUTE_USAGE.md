# Example: Using Modules in API Routes

This document shows how to refactor API routes to use the new modular architecture.

## Before: Direct Implementation

```typescript
// apps/api/src/routes/seniors.ts (OLD WAY)
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { newsService } from '../services/news-service.js';

export const seniorsRouter = Router();
seniorsRouter.use(authenticate);

// Create senior
seniorsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createSeniorSchema.parse(req.body);

    // Direct database access - tightly coupled!
    const result = await db.query(
      `INSERT INTO seniors (
        caregiver_id, name, phone, date_of_birth, timezone,
        location_city, location_state, interests, family_info,
        medical_notes, preferred_call_times, quiet_hours_start, quiet_hours_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        req.caregiverId,
        data.name,
        data.phone,
        data.dateOfBirth || null,
        data.timezone,
        data.locationCity || null,
        data.locationState || null,
        data.interests,
        data.familyInfo || null,
        data.medicalNotes || null,
        data.preferredCallTimes || null,
        data.quietHoursStart || null,
        data.quietHoursEnd || null,
      ]
    );

    res.status(201).json({ senior: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get personalized news
seniorsRouter.get('/:id/news', async (req: AuthRequest, res, next) => {
  try {
    // Multiple database calls - complex logic in route!
    const result = await db.query(
      `SELECT id, name, date_of_birth, location_city, location_state, interests
       FROM seniors
       WHERE id = $1 AND caregiver_id = $2`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const senior = result.rows[0];

    // Calling service directly
    const newsItems = await newsService.getPersonalizedNews({
      name: senior.name,
      date_of_birth: senior.date_of_birth,
      location_city: senior.location_city,
      location_state: senior.location_state,
      interests: senior.interests || [],
    });

    res.json({ news: newsItems });
  } catch (error) {
    next(error);
  }
});
```

## After: Module-Based Implementation

```typescript
// apps/api/src/routes/seniors.v2.ts (NEW WAY)
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/error-handler.js';
import { container } from '../container.js';
import type { ISeniorProfiles, ISkillsSystem } from '@donna/shared/interfaces';

export function createSeniorsRouter() {
  const router = Router();

  // Get module instances from container
  const seniorProfiles = container.get<ISeniorProfiles>('SeniorProfiles');
  const skillsSystem = container.get<ISkillsSystem>('SkillsSystem');

  router.use(authenticate);

  // ========================================
  // Create senior - Clean and simple!
  // ========================================
  router.post('/', async (req: AuthRequest, res, next) => {
    try {
      const data = createSeniorSchema.parse(req.body);

      // ONE line - module handles all complexity!
      const senior = await seniorProfiles.create(req.caregiverId, data);

      res.status(201).json({ senior });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // List seniors - Also simple!
  // ========================================
  router.get('/', async (req: AuthRequest, res, next) => {
    try {
      const filters = {
        isActive: req.query.active === 'true',
        search: req.query.search as string,
      };

      const seniors = await seniorProfiles.list(req.caregiverId, filters);

      res.json({ seniors });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // Get single senior
  // ========================================
  router.get('/:id', async (req: AuthRequest, res, next) => {
    try {
      const senior = await seniorProfiles.getById(req.params.id);

      // Authorization check
      if (senior.caregiverId !== req.caregiverId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.json({ senior });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // Update senior
  // ========================================
  router.put('/:id', async (req: AuthRequest, res, next) => {
    try {
      const data = updateSeniorSchema.parse(req.body);

      // Verify access first
      const existing = await seniorProfiles.getById(req.params.id);
      if (existing.caregiverId !== req.caregiverId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const senior = await seniorProfiles.update(req.params.id, data);

      res.json({ senior });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // Delete senior
  // ========================================
  router.delete('/:id', async (req: AuthRequest, res, next) => {
    try {
      // Verify access
      const existing = await seniorProfiles.getById(req.params.id);
      if (existing.caregiverId !== req.caregiverId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await seniorProfiles.delete(req.params.id);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // Get personalized news - Using Skills System!
  // ========================================
  router.get('/:id/news', async (req: AuthRequest, res, next) => {
    try {
      // Get senior profile
      const senior = await seniorProfiles.getById(req.params.id);

      // Verify access
      if (senior.caregiverId !== req.caregiverId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Execute news search skill
      const result = await skillsSystem.execute('news-search', {
        senior,
        maxItems: 5,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ news: result.data });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

## Key Improvements

### 1. Separation of Concerns
**Before**: Route contained business logic, database queries, validation
**After**: Route only handles HTTP concerns (validation, authorization, response formatting)

### 2. Testability
```typescript
// Easy to test with mocks!
const mockSeniorProfiles: ISeniorProfiles = {
  create: jest.fn().mockResolvedValue(mockSenior),
  getById: jest.fn().mockResolvedValue(mockSenior),
  // ...
};

container.set('SeniorProfiles', mockSeniorProfiles);

// Test route without database!
```

### 3. Maintainability
**Before**: Change to senior creation = update route AND database logic
**After**: Change to senior creation = update SeniorProfiles module only. Route stays the same!

### 4. Interchangeability
```typescript
// Swap to a different storage backend (MongoDB, DynamoDB, etc.)
// Just create new implementation of ISeniorProfiles
const mongoSeniorProfiles = new MongoSeniorProfilesService(mongoClient);
container.set('SeniorProfiles', mongoSeniorProfiles);

// Routes don't change at all!
```

### 5. Skills as Plugins
```typescript
// News is now a skill - can be disabled/swapped easily
const result = await skillsSystem.execute('news-search', { senior });

// Add new skill without touching routes
skillsSystem.register(new WeatherSkill());
const weather = await skillsSystem.execute('weather', { senior });
```

## Container Setup in Main App

```typescript
// apps/api/src/index.ts
import express from 'express';
import { createContainer, loadConfig } from '../../config/dependency-injection';
import { createSeniorsRouter } from './routes/seniors.v2';

async function startServer() {
  // Load config from environment
  const config = loadConfig();

  // Create and initialize container
  const container = createContainer(config);

  // Create Express app
  const app = express();

  // Register routes (passing container)
  app.use('/api/seniors', createSeniorsRouter(container));

  // Start server
  app.listen(config.api.port, () => {
    console.log(`🚀 Server running on port ${config.api.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await container.shutdown();
    process.exit(0);
  });
}

startServer().catch(console.error);
```

## Comparison Table

| Aspect | Old Way | New Way |
|--------|---------|---------|
| **Lines of code per route** | 30-50 | 10-20 |
| **Database coupling** | Direct SQL in routes | Abstracted in modules |
| **Business logic** | Mixed with HTTP concerns | Separated in modules |
| **Testability** | Requires database | Mockable interfaces |
| **Swappability** | Difficult | Easy (just swap module) |
| **Reusability** | Routes only | Modules work everywhere |
| **Error handling** | Scattered | Centralized in modules |

## Result

Routes are now **thin coordinators** that:
1. Validate HTTP input
2. Check authorization
3. Call appropriate modules
4. Format HTTP response

All business logic lives in **independent, testable modules**!
