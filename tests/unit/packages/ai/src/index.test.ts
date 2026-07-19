import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAIProvider, type AIProviderName } from '../../../../../packages/ai/src/index.js';
import { MockAIProvider } from '../../../../../packages/ai/src/providers/mock.js';

// Mock the providers
vi.mock('../../../../../packages/ai/src/providers/openai.js', () => ({
  OpenAIProvider: vi.fn().mockImplementation((key: string) => ({ type: 'openai', key })),
}));

vi.mock('../../../../../packages/ai/src/providers/gemini.js', () => ({
  GeminiProvider: vi.fn().mockImplementation((key: string) => ({ type: 'gemini', key })),
}));

vi.mock('../../../../../packages/ai/src/providers/claude.js', () => ({
  ClaudeProvider: vi.fn().mockImplementation((key: string) => ({ type: 'claude', key })),
}));

vi.mock('../../../../../packages/ai/src/providers/mock.js', () => ({
  MockAIProvider: vi.fn().mockImplementation(() => ({ type: 'mock' })),
}));

describe('createAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('in development mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should return MockAIProvider when key is not set for openai', () => {
      const provider = createAIProvider('openai');
      expect(provider).toEqual({ type: 'mock' });
      expect(MockAIProvider).toHaveBeenCalled();
    });

    it('should return OpenAIProvider when key is set for openai', () => {
      process.env.OPENAI_API_KEY = 'sk-test123';
      const provider = createAIProvider('openai');
      expect(provider).toEqual({ type: 'openai', key: 'sk-test123' });
    });

    it('should return MockAIProvider when key is placeholder for openai', () => {
      process.env.OPENAI_API_KEY = 'sk-...';
      const provider = createAIProvider('openai');
      expect(provider).toEqual({ type: 'mock' });
    });

    it('should work for gemini provider', () => {
      process.env.GEMINI_API_KEY = 'gemini-key';
      const provider = createAIProvider('gemini');
      expect(provider).toEqual({ type: 'gemini', key: 'gemini-key' });
    });

    it('should work for claude provider', () => {
      process.env.ANTHROPIC_API_KEY = 'claude-key';
      const provider = createAIProvider('claude');
      expect(provider).toEqual({ type: 'claude', key: 'claude-key' });
    });

    it('should default to openai', () => {
      process.env.OPENAI_API_KEY = 'sk-test123';
      const provider = createAIProvider();
      expect(provider).toEqual({ type: 'openai', key: 'sk-test123' });
    });
  });

  describe('in production mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should throw error when key is not set for openai', () => {
      expect(() => createAIProvider('openai')).toThrow('OPENAI_API_KEY is not set');
    });

    it('should throw error when key is placeholder for openai', () => {
      process.env.OPENAI_API_KEY = 'placeholder';
      expect(() => createAIProvider('openai')).toThrow('OPENAI_API_KEY is not set');
    });

    it('should return provider when key is set', () => {
      process.env.OPENAI_API_KEY = 'sk-prod123';
      const provider = createAIProvider('openai');
      expect(provider).toEqual({ type: 'openai', key: 'sk-prod123' });
    });
  });

  it('should throw error for unknown provider', () => {
    expect(() => createAIProvider('unknown' as AIProviderName)).toThrow('Unknown AI provider: unknown');
  });
});