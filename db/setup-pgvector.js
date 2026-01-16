import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setupPgvector() {
  try {
    console.log('Enabling pgvector extension...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('pgvector extension enabled successfully!');
  } catch (error) {
    console.error('Error enabling pgvector:', error.message);
  } finally {
    await pool.end();
  }
}

setupPgvector();
