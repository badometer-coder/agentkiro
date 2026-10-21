import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

/**
 * Multi-Provider LLM with Native Function Calling
 * Uses the model's built-in tool_calls API — same as Hermes.
 * No more [TOOL: ...] text parsing — models call tools reliably this way.
 */

class MultiLLMProvider {
  constructor(env, notifyCallback = null) {
    this.env = env;
    this.providers = [];
    this.currentProviderIndex = 0;
    this.notifyCallback = notifyCallback;
    this.initializeProviders();
  }

  initializeProviders() {
    // Gemini first (best quality)
    const geminiKeys = this.loadApiKeys('GEMINI_API_KEY');
    geminiKeys.forEach((key, idx) => {
      if (key && !key.includes('paste_your')) {
        this.providers.push({ type: 'gemini', key, client: new GoogleGenerativeAI(key), name: `Gemini #${idx + 1}` });
      }
    });

    // Groq as fallback (OpenAI-compatible, supports function calling)
    const groqKeys = this.loadApiKeys('GROQ_API_KEY');
    groqKeys.forEach((key, idx) => {
      this.providers.push({ type: 'groq', key, client: new Groq({ apiKey: key, timeout: 120000 }), name: `Groq #${idx + 1}` });
    });

    // OpenAI as fallback
    const openaiKeys = this.loadApiKeys('OPENAI_API_KEY');
    openaiKeys.forEach((key, idx) => {
      if (key && !key.includes('paste_your')) {
        this.providers.push({ type: 'openai', key, client: new OpenAI({ apiKey: key, timeout: 120000 }), name: `OpenAI #${idx + 1}` });
      }
    });

    console.log(`✅ Loaded ${this.providers.length} LLM provider(s):`);
    this.providers.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
  }

  loadApiKeys(prefix) {
    const keys = [];
    for (let i = 1; i <= 20; i++) {
      const key = this.env[`${prefix}${i === 1 ? '' : '_' + i}`];
      if (key && !key.includes('paste_your') && !key.includes('your_')) keys.push(key);
    }
    return keys;
  }

  getCurrentProvider() { return this.providers[this.currentProviderIndex]; }

  resetToFirst() {
    this.currentProviderIndex = 0;
  }

  rotateProvider() {
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    console.log(`🔄 Rotating to: ${this.getCurrentProvider().name}`);
  }

  /**
   * Standard text completion (no tools) — for classifier, summaries, etc.
   */
  async callLLM(messages, options = {}) {
    let attempts = 0;
    let lastError = null;

    while (attempts < this.providers.length) {
      const provider = this.getCurrentProvider();
      attempts++;
      try {
        console.log(`📞 Calling ${provider.name}... (timeout: ${(options.timeout || 30000) / 1000}s)`);
        const text = await this._callProvider(provider, messages, options);
        console.log(`✅ ${provider.name} succeeded`);
        return text;
      } catch (err) {
        lastError = err;
        console.error(`❌ ${provider.name} failed: ${err.message}`);
        this.rotateProvider();
      }
    }
    throw new Error(`All providers failed. Last: ${lastError?.message}`);
  }

  /**
   * Native function calling — sends tool schemas to model, gets back structured tool calls.
   * This is how Hermes works. Models are much more reliable with this vs text parsing.
   *
   * Returns: { text: string, toolCalls: [{name, args}] }
   */
  async callLLMWithTools(messages, toolSchemas, options = {}) {
    let attempts = 0;
    let lastError = null;

    while (attempts < this.providers.length) {
      const provider = this.getCurrentProvider();
      attempts++;
      try {
        console.log(`📞 Calling ${provider.name} with tools... (${toolSchemas.length} tools)`);
        const result = await this._callProviderWithTools(provider, messages, toolSchemas, options);
        console.log(`✅ ${provider.name} succeeded`);
        return result;
      } catch (err) {
        lastError = err;
        console.error(`❌ ${provider.name} failed: ${err.message}`);
        this.rotateProvider();
      }
    }
    throw new Error(`All providers failed. Last: ${lastError?.message}`);
  }

  async _callProvider(provider, messages, options) {
    if (provider.type === 'groq' || provider.type === 'openai') {
      const res = await provider.client.chat.completions.create({
        model: provider.type === 'groq' ? 'qwen/qwen3.8-27b' : 'gpt-4o-mini',
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens || 1000,
      });
      return res.choices[0]?.message?.content || '';
    }

    if (provider.type === 'gemini') {
      const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
      const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const model = provider.client.getGenerativeModel({
        model: 'gemini-3.8-flash',
        generationConfig: { maxOutputTokens: 8192, temperature: options.temperature ?? 0.3 },
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      });
      const result = await model.generateContent({ contents });
      return result.response.text();
    }
  }

  async _callProviderWithTools(provider, messages, toolSchemas, options) {
    // Convert tool schemas to OpenAI format
    const tools = toolSchemas.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {}, required: [] },
      },
    }));

    if (provider.type === 'groq' || provider.type === 'openai') {
      const res = await provider.client.chat.completions.create({
        model: provider.type === 'groq' ? 'qwen/qwen3.8-27b' : 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens || 800,
      });

      const msg = res.choices[0]?.message;
      const toolCalls = (msg?.tool_calls || []).map(tc => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
        id: tc.id,
      }));

      return { text: msg?.content || '', toolCalls, raw: msg };
    }

    if (provider.type === 'gemini') {
      const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
      const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // Gemini function declarations
      const functionDeclarations = toolSchemas.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
      }));

      const model = provider.client.getGenerativeModel({
        model: 'gemini-3.8-flash',
        generationConfig: { maxOutputTokens: 8192, temperature: options.temperature ?? 0.3 },
        tools: [{ functionDeclarations }],
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      });

      const result = await model.generateContent({ contents });
      const response = result.response;
      const text = response.text ? response.text() : '';

      // Extract function calls from Gemini response
      const toolCalls = [];
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.functionCall) {
            toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
          }
        }
      }

      return { text, toolCalls };
    }

    throw new Error(`Provider type ${provider.type} not supported for tool calling`);
  }

  getStats() {
    return {
      totalProviders: this.providers.length,
      currentProvider: this.getCurrentProvider()?.name,
      providers: this.providers.map(p => p.name),
    };
  }
}

export default MultiLLMProvider;
