import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load test credentials
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

setup.describe.configure({ mode: 'serial' });

setup('initialize Clerk testing token', async () => {
  await clerkSetup();
});
