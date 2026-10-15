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
    // Load Groq keys
    const groqKeys = this.loadApiKeys('GROQ_API_KEY');
    groqKeys.forEach((key, idx) => {
      this.providers.push({
        type: 'groq',
        key: key,
        client: new Groq({
          apiKey: key,
          timeout: 10 * 60 * 1000, // 10 minutes
        }),
        name: `Groq #${idx + 1}`,
      });
    });

    // Load Gemini keys (commented out for now)
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

    // Load OpenAI keys (commented out for now)
    const openaiKeys = this.loadApiKeys('OPENAI_API_KEY');
    openaiKeys.forEach((key, idx) => {
      if (key && !key.includes('paste_your')) {
        this.providers.push({
          type: 'openai',
          key: key,
          client: new OpenAI({
            apiKey: key,
            timeout: 10 * 60 * 1000, // 10 minutes
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
    const timeout = options.timeout || 5 * 60 * 1000; // 5 minutes default

    while (attempts < maxAttempts) {
      const provider = this.getCurrentProvider();
      attempts++;

      try {
        console.log(`📞 Calling ${provider.name}... (timeout: ${timeout / 1000}s)`);

        let response;

        if (provider.type === 'groq') {
          response = await provider.client.chat.completions.create({
            model: options.model || 'openai/gpt-oss-20b',
            messages: messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 3000,
          });
          return response.choices[0]?.message?.content || '';
        } else if (provider.type === 'gemini') {
          const model = provider.client.getGenerativeModel({
            model: options.model || 'gemini-1.5-flash',
          });

          const systemPrompt = messages[0]?.role === 'system' ? messages[0]?.content : '';
          const userMessages = messages.filter((m) => m.role !== 'system');

          const chat = model.startChat({
            systemInstruction: systemPrompt || undefined,
          });

          const userMessage =
            userMessages[userMessages.length - 1]?.content || 'Process the request';
          const result = await chat.sendMessage(userMessage);
          return result.response.text();
        } else if (provider.type === 'openai') {
          response = await provider.client.chat.completions.create({
            model: options.model || 'gpt-4o-mini',
            messages: messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 3000,
          });
          return response.choices[0]?.message?.content || '';
        }
      } catch (error) {
        lastError = error;
        console.error(`❌ ${provider.name} failed:`);
        console.error(`   Message: ${error.message}`);
        console.error(`   Full error: ${JSON.stringify(error, null, 2)}`);
        if (error.stack) {
          console.error(`   Stack: ${error.stack.split('\n')[0]}`);
        }

        if (
          error.message.includes('429') ||
          error.message.includes('rate limit') ||
          error.message.includes('quota')
        ) {
          console.log(`⚠️ Rate limit hit. Rotating to next provider...`);
          
          // Send Telegram notification
          if (this.notifyCallback) {
            this.notifyCallback(`⚠️ RATE LIMIT: ${provider.name} exhausted\n\n🔄 Rotating to next provider...`);
          }
          
          this.rotateProvider();
        } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
          console.log(`⏱️ Timeout on ${provider.name}. Rotating to next provider...`);
          
          if (this.notifyCallback) {
            this.notifyCallback(`⏱️ TIMEOUT: ${provider.name} slow\n\n🔄 Rotating to next provider...`);
          }
          
          this.rotateProvider();
        } else {
          console.log(`Error occurred. Trying next provider...`);
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
