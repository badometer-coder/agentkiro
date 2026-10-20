import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Multi-Provider LLM Rotation
 * Supports: Groq, Google Gemini, OpenAI
 * Auto-rotates on rate limits or errors
 */

class MultiLLMProvider {
  constructor(env, notifyCallback = null) {
    this.env = env;
    this.providers = [];
    this.currentProviderIndex = 0;
    this.providerStats = {};
    this.notifyCallback = notifyCallback; // Telegram notification callback

    this.initializeProviders();
  }

  initializeProviders() {
    // === GEMINI PRIMARY (better quality, 16k output, no truncation) ===
    const geminiKeys = this.loadApiKeys('GEMINI_API_KEY');
    geminiKeys.forEach((key, idx) => {
      if (key && !key.includes('paste_your')) {
        this.providers.push({
          type: 'gemini',
          key: key,
          client: new GoogleGenerativeAI(key),
          name: `Gemini #${idx + 1}`,
        });
      }
    });

    // === GROQ as fallback ===
    const groqKeys = this.loadApiKeys('GROQ_API_KEY');
    groqKeys.forEach((key, idx) => {
      this.providers.push({
        type: 'groq',
        key: key,
        client: new Groq({
          apiKey: key,
          timeout: 10 * 60 * 1000,
        }),
        name: `Groq #${idx + 1}`,
      });
    });

    // === OpenAI as fallback ===
    const openaiKeys = this.loadApiKeys('OPENAI_API_KEY');
    openaiKeys.forEach((key, idx) => {
      if (key && !key.includes('paste_your')) {
        this.providers.push({
          type: 'openai',
          key: key,
          client: new OpenAI({
            apiKey: key,
            timeout: 10 * 60 * 1000,
          }),
          name: `OpenAI #${idx + 1}`,
        });
      }
    });

    console.log(`✅ Loaded ${this.providers.length} LLM provider(s):`);
    this.providers.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
  }

  loadApiKeys(prefix) {
    const keys = [];
    for (let i = 1; i <= 20; i++) {
      const key = this.env[`${prefix}${i === 1 ? '' : '_' + i}`];
      if (
        key &&
        key !== `your_${prefix.toLowerCase()}_key_here` &&
        key !== `your_${prefix.toLowerCase()}_key_${i}_here`
      ) {
        keys.push(key);
      }
    }
    return keys;
  }

  getCurrentProvider() {
    return this.providers[this.currentProviderIndex];
  }

  rotateProvider() {
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    const provider = this.getCurrentProvider();
    console.log(`🔄 Rotating to: ${provider.name}`);
  }

  async callLLM(messages, options = {}) {
    if (this.providers.length === 0) {
      throw new Error('❌ No LLM providers configured');
    }

    let lastError = null;
    let attempts = 0;
    const maxAttempts = this.providers.length;
    const timeout = options.timeout || 30 * 1000; // 30 seconds default

    while (attempts < maxAttempts) {
      const provider = this.getCurrentProvider();
      attempts++;

      try {
        console.log(`📞 Calling ${provider.name}... (timeout: ${timeout / 1000}s)`);

        let response;

        if (provider.type === 'groq') {
          try {
            response = await provider.client.chat.completions.create({
              model: options.model || 'qwen/qwen3.8-27b',
              messages: messages,
              temperature: options.temperature || 0.7,
              max_tokens: options.max_tokens || 800,
            });
            const content = response.choices[0]?.message?.content || '';
            console.log(`✅ ${provider.name} succeeded`);
            return content;
          } catch (err) {
            throw err;
          }
        } else if (provider.type === 'gemini') {
          try {
            const systemPrompt = messages[0]?.role === 'system' ? messages[0]?.content : '';
            const userMessages = messages.filter((m) => m.role !== 'system');

            // Convert full conversation to Gemini's contents format
            // This preserves multi-turn context (the bug was: only last message was sent)
            const contents = userMessages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            }));

            const modelConfig = {
              model: 'gemini-3.5-flash-lite',
              generationConfig: {
                maxOutputTokens: 8192,
                temperature: options.temperature || 0.3,
              },
            };
            if (systemPrompt) {
              modelConfig.systemInstruction = {
                parts: [{ text: systemPrompt }],
              };
            }

            const model = provider.client.getGenerativeModel(modelConfig);
            const result = await model.generateContent({ contents });
            const content = result.response.text();
            console.log(`✅ ${provider.name} succeeded`);
            return content;
          } catch (err) {
            throw err;
          }
        } else if (provider.type === 'openai') {
          try {
            response = await provider.client.chat.completions.create({
              model: options.model || 'gpt-4o-mini',
              messages: messages,
              temperature: options.temperature || 0.7,
              max_tokens: options.max_tokens || 800,
            });
            const content = response.choices[0]?.message?.content || '';
            console.log(`✅ ${provider.name} succeeded`);
            return content;
          } catch (err) {
            throw err;
          }
        }
      } catch (error) {
        lastError = error;
        console.error(`❌ ${provider.name} failed:`);
        console.error(`   Error: ${error.message}`);

        if (
          error.message.includes('429') ||
          error.message.includes('rate limit') ||
          error.message.includes('quota')
        ) {
          console.log(`⚠️ Rate limit hit. Rotating to next provider...`);
          if (this.notifyCallback) {
            this.notifyCallback(`⚠️ RATE LIMIT: ${provider.name} exhausted`);
          }
          this.rotateProvider();
        } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
          console.log(`⏱️ Timeout on ${provider.name}. Rotating...`);
          if (this.notifyCallback) {
            this.notifyCallback(`⏱️ TIMEOUT: ${provider.name}`);
          }
          this.rotateProvider();
        } else {
          console.log(`⚠️ Error on ${provider.name}. Trying next...`);
          this.rotateProvider();
        }
      }
    }

    throw new Error(
      `❌ All ${maxAttempts} LLM providers failed. Last error: ${lastError?.message}`
    );
  }

  getStats() {
    return {
      totalProviders: this.providers.length,
      currentProvider: this.getCurrentProvider()?.name,
      providers: this.providers.map((p) => p.name),
    };
  }
}

export default MultiLLMProvider;
