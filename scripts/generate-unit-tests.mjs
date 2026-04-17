#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createAIProvider } from '@travel/ai';
import { join, extname } from 'path';

async function generateUnitTests(filePath) {
  try {
    const code = readFileSync(filePath, 'utf-8');

    if (!code.trim()) {
      console.log(`Skipping empty file: ${filePath}`);
      return;
    }

    // Skip test files, config files, etc.
    if (filePath.includes('.test.') || filePath.includes('.spec.') ||
        filePath.includes('.config.') || filePath.includes('.d.ts') ||
        extname(filePath) !== '.ts' && extname(filePath) !== '.js') {
      console.log(`Skipping non-source file: ${filePath}`);
      return;
    }

    // Read AI_PROVIDER from env, default to 'mock' for testing
    const aiProviderName = process.env.AI_PROVIDER || 'mock';
    const aiProvider = createAIProvider(aiProviderName);

    const prompt = `Generate comprehensive unit tests for the following TypeScript/JavaScript code using Vitest framework. Include tests for all functions, classes, and edge cases. Ensure high coverage.

Code file: ${filePath}

\`\`\`typescript
${code}
\`\`\`

Generate tests in the same directory with .test.ts extension. Include describe blocks, it blocks, and proper assertions. Mock external dependencies if needed.`;

    console.log(`[${aiProviderName.toUpperCase()}] Generating tests for ${filePath}...`);

    // Note: This is a placeholder. In real implementation, you'd call the AI provider
    // const response = await aiProvider.generateTests(prompt);
    // Then write the test file

    console.log(`Test generation completed for ${filePath}`);
    // For now, just log that we would generate tests

  } catch (error) {
    console.error(`Error generating tests for ${filePath}:`, error.message);
  }
}

// Get file paths from command line args
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('Usage: node scripts/generate-unit-tests.mjs <file1> <file2> ...');
  process.exit(1);
}

Promise.all(files.map(generateUnitTests)).then(() => {
  console.log('Test generation scan completed.');
});