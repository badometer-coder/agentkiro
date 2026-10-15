import Groq from 'groq-sdk';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';

dotenv.config();

const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

let setupState = {};
let userChatId = null;

// Generate comprehensive plan from answers
async function generatePlanFromAnswers(answers) {
  try {
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are an expert app architect and project manager.
Based on the user's app vision and requirements, create a DETAILED, PRIORITIZED development roadmap.

Format your response as:
## PHASE 1: Foundation (Week 1-2)
- Task 1
- Task 2

## PHASE 2: Core Features (Week 3-4)
- Task 1
- Task 2

Include effort estimates (quick/medium/complex) and implementation order.
Make it actionable and specific.`,
        },
        {
          role: 'user',
          content: `
APP VISION:
Purpose: ${answers.purpose}
Target Users: ${answers.users}

MAIN FEATURES WANTED:
${answers.features}

TECH STACK:
${answers.techStack}

TIMELINE PREFERENCE:
${answers.timeline}

Create a detailed development roadmap.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating plan:', error.message);
    return null;
  }
}

bot.start((ctx) => {
  ctx.reply(`🎯 APP DEVELOPMENT SETUP WIZARD

I'll ask you about your app vision, and then create a detailed development plan that I can execute.

Ready? Let's go! 🚀

📝 Question 1: What is the PRIMARY PURPOSE of your app?
(Describe in 1-2 sentences what your app does)`);
  
  userChatId = ctx.chat.id;
  setupState[ctx.chat.id] = { step: 1 };
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return; // Skip commands
  
  const chatId = ctx.chat.id;
  if (!setupState[chatId]) setupState[chatId] = { step: 1 };
  
  const state = setupState[chatId];
  
  if (state.step === 1) {
    state.purpose = ctx.message.text;
    ctx.reply(`✅ Purpose: "${state.purpose}"\n\n📝 Question 2: Who are your TARGET USERS?
(e.g., "Young professionals, friends, people in same area")`);
    state.step = 2;
    
  } else if (state.step === 2) {
    state.users = ctx.message.text;
    ctx.reply(`✅ Users: "${state.users}"\n\n📝 Question 3: List MAIN FEATURES (one per line)
Examples:
- GPS-based discovery
- Real-time chat
- User profiles
- Blocking/reporting`);
    state.step = 3;
    
  } else if (state.step === 3) {
    state.features = ctx.message.text;
    ctx.reply(`✅ Features listed!\n\n📝 Question 4: What's your TECH STACK?
(e.g., "React Native, Expo SDK 54, TypeScript, Supabase, PostGIS")`);
    state.step = 4;
    
  } else if (state.step === 4) {
    state.techStack = ctx.message.text;
    ctx.reply(`✅ Tech stack: "${state.techStack}"\n\n📝 Question 5: What's your TIMELINE?
(e.g., "2 weeks", "ASAP", "By end of month")`);
    state.step = 5;
    
  } else if (state.step === 5) {
    state.timeline = ctx.message.text;
    
    ctx.reply(`✅ Timeline: "${state.timeline}"\n\n🔄 Generating your development plan...`);
    
    // Generate plan
    const plan = await generatePlanFromAnswers(state);
    
    if (plan) {
      const messages = plan.match(/[\s\S]{1,4096}/g) || [plan];
      ctx.reply(`📋 YOUR DEVELOPMENT PLAN:\n\n${messages[0]}`);
      
      for (let i = 1; i < messages.length; i++) {
        ctx.reply(messages[i]);
      }
      
      ctx.reply(`\n✅ Plan ready!\n\nNext steps:
1. Review the plan above
2. Run: /dev-agent (to start the dev agent)
3. Use: /task <description> to assign work

Type /help for all commands.`);
    } else {
      ctx.reply('❌ Failed to generate plan. Try again.');
    }
    
    state.step = 0;
  }
});

bot.help((ctx) => {
  ctx.reply(`🎯 SETUP WIZARD HELP

/start - Begin app setup wizard
/help - Show this message

The wizard asks you about your app, then creates a development plan.`);
});

console.log('🧙 App Setup Wizard Started');
console.log('Listening for setup questions...\n');

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
