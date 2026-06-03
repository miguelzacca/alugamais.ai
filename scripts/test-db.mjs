import { createClient } from '@libsql/client';
import { config } from 'dotenv';
config({ path: '.env.local' });

console.log("URL:", process.env.TURSO_DATABASE_URL);
console.log("TOKEN length:", process.env.TURSO_AUTH_TOKEN?.length);
console.log("Starts with quotes?", process.env.TURSO_AUTH_TOKEN?.startsWith('"'));

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function test() {
  try {
    const result = await client.execute('SELECT 1');
    console.log('✅ Connected successfully!');
  } catch (error) {
    console.error('❌ Error connecting:', error);
  }
}

test();
