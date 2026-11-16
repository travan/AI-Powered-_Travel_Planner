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

vi.mock('../../../../../packages/ai/src/providers/ollama.js', () => ({
  OllamaProvider: vi.fn().mockImplementation((options: object) => ({ type: 'ollama', options })),
}));

vi.mock('../../../../../packages/ai/src/providers/mock.js', () => ({
  MockAIProvider: vi.fn().mockImplementation(() => ({ type: 'mock' })),
}));

describe('createAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_OVERVIEW_MODEL;
    delete process.env.OLLAMA_DETAIL_MODEL;
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

    it('should use the configured Ollama endpoint and models', () => {
      process.env.OLLAMA_BASE_URL = 'http://host.docker.internal:11434/v1';
      process.env.OLLAMA_OVERVIEW_MODEL = 'gemma4:latest';
      process.env.OLLAMA_DETAIL_MODEL = 'qwen3.5:9b';

      expect(createAIProvider('ollama')).toEqual({
        type: 'ollama',
        options: {
          baseURL: 'http://host.docker.internal:11434/v1',
          overviewModel: 'gemma4:latest',
          detailModel: 'qwen3.5:9b',
        },
      });
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
      process.env.OPENAI_MODEL = 'test-model';
      const provider = createAIProvider('openai');
      expect(provider).toEqual({ type: 'openai', key: 'sk-prod123' });
    });
  });

  it('should throw error for unknown provider', () => {
    expect(() => createAIProvider('unknown' as AIProviderName)).toThrow('Unknown AI provider: unknown');
  });
});