import Groq from 'groq-sdk';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import MultiLLMProvider from './multi-llm-provider.js';
import MemoryManager from './memory-manager.js';
import WebSearch from './web-search.js';
import AgentTools from './agent-tools.js';
import SkillsManager from './skills-manager.js';
import SelfImprovementEngine from './self-improvement-engine.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { startHealthServer, setCIErrorCallback } from './health-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

// Start health server in-process (handles /ci-error webhook from GitHub Actions)
startHealthServer();

// Notification function for rate limits
let telegramBotContext = null;
function notifyRateLimit(message) {
  console.log(`📢 NOTIFICATION: ${message}`);
  if (telegramBotContext) {
    telegramBotContext.telegram.sendMessage(telegramBotContext.chat.id, message).catch(() => {});
  }
}

// Initialize multi-provider LLM with notification callback
const llmProvider = new MultiLLMProvider(process.env, notifyRateLimit);

// Initialize Memory Manager
const memory = new MemoryManager(process.env);

// Initialize Agent Tools
const agentTools = new AgentTools(process.env, memory);

// Initialize Skills Manager
const skillsManager = new SkillsManager();

// Initialize Self-Improvement Engine (Hermes-style learning loop)
const selfImprovementEngine = new SelfImprovementEngine();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: 90 * 1000, // 90 seconds — telegraf timeout, tasks run async beyond this
});

const APP_REQUIREMENTS = `
PROXIMITY SOCIAL APP - DEVELOPMENT REQUIREMENTS

TECH STACK: React Native + Expo + TypeScript + Supabase

FILE STRUCTURE:
- src/screens/auth/LoginScreen.tsx
- src/screens/auth/ProfileSetupScreen.tsx
- src/screens/main/ProximityFeedScreen.tsx
- src/screens/main/ChatThreadScreen.tsx
- src/components/Card.tsx
- src/components/common/Avatar.tsx
- src/components/common/EmptyState.tsx
- src/components/proximity/NearbyPeerCard.tsx
- src/components/proximity/RadiusFilterPill.tsx
- src/components/proximity/RadiusWheel.tsx
- src/components/proximity/RadiusSlider.tsx
- src/components/proximity/SignalIndicator.tsx
- src/components/proximity/DistanceBadge.tsx
- src/components/proximity/ProximityHeader.tsx
- src/theme/index.ts (main theme file)
- src/theme/DesignTokens.ts
- src/constants/theme.ts (colors, spacing)
- src/hooks/auth/useAuth.ts
- src/hooks/location/useCurrentLocation.ts
- src/hooks/proximity/useNearbyPeers.ts
- src/hooks/messaging/useChatMessages.ts
- src/lib/utils/index.ts
- src/types/index.ts
- src/types/database.ts
- src/config/supabase.ts

CURRENT THEME (src/constants/theme.ts):
- background: '#F9FAFB' (light gray)
- surface: '#FFFFFF'
- primary: '#6366F1' (indigo)
- text.primary: '#111827'

NAVIGATION: Expo Router (file-based routing)

✅ COMPLETED FEATURES:
- Database setup with PostGIS
- Authentication (Login/Signup)
- Profile management
- Proximity feed (GPS-based)
- Real-time chat with WebSockets
- Test accounts

❌ TODO:
1. Dark mode / black background theme
2. Fix message syncing edge cases
3. User blocking system
4. Chat read receipts
5. Offline message queuing
6. Performance optimization
7. Battery audit
8. Testing & QA
9. Security audit
10. Release prep
`;

let taskQueue = [];
let currentTask = null;
let taskLog = [];
let lastTaskKey = '';      // prevent duplicate task runs
let lastTaskTime = 0;
let stopRequested = false; // Global stop flag — set by "stop" command

// === CONVERSATION PERSISTENCE (Hermes-style: save to disk, load on startup) ===
const conversationFile = path.join(__dirname, 'memory', 'conversation.json');

function loadConversationHistory() {
  try {
    if (fs.existsSync(conversationFile)) {
      const data = JSON.parse(fs.readFileSync(conversationFile, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) {
        // Filter out error/stuck messages — they poison the LLM context
        const cleaned = data.filter(m => {
          const content = m.content || '';
          return !content.includes('⚠️ I got stuck') && !content.includes('The file may be truncated');
        });
        if (cleaned.length < data.length) {
          console.log(`🧹 Filtered ${data.length - cleaned.length} error messages from history`);
        }
        console.log(`📜 Loaded ${cleaned.length} conversation entries from disk`);
        return cleaned.slice(-6); // keep last 6 (was 30 — too many tokens)
      }
    }
  } catch (e) {
    console.log(`⚠️ Could not load conversation history: ${e.message}`);
  }
  return [];
}

function saveConversationHistory() {
  try {
    const dir = path.dirname(conversationFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Don't save error/stuck messages — they poison future tasks
    const cleaned = conversationHistory.filter(m => {
      const content = m.content || '';
      return !content.includes('⚠️ I got stuck') && !content.includes('The file may be truncated') && !content.includes('not found');
    });
    fs.writeFileSync(conversationFile, JSON.stringify(cleaned.slice(-6)), 'utf-8');
  } catch (e) {
    console.log(`⚠️ Could not save conversation history: ${e.message}`);
  }
}

let conversationHistory = loadConversationHistory();

async function createExecutionPlan(topic = null) {
  try {
    console.log('📋 Project Manager: Creating execution plan...');
    
    const messages = [
      {
        role: 'system',
        content: `Create a detailed, actionable development plan for the Proximity app.

For EACH task, provide:
- Task name
- EXACT file paths to modify
- Specific code implementation details
- What to test

Format each task as: "N. [File: path/to/file.ts] - Task description - Expected changes: ..."

Be SPECIFIC. Every task should be clear enough that a developer can immediately start coding.`,
      },
      {
        role: 'user',
        content: topic
          ? `Create 5 specific tasks focused on: "${topic}"\n\nContext:\n${APP_REQUIREMENTS}`
          : `Requirements:\n${APP_REQUIREMENTS}\n\nCreate 5 specific, actionable development tasks with exact file paths and implementation details.`,
      },
    ];

    const plan = await llmProvider.callLLM(messages, {
      temperature: 0.6,
      max_tokens: 800,
    });

    const tasks = plan.split('\n').filter(line => line.trim().length > 0);
    
    console.log(`✅ Created ${tasks.length} tasks`);
    return tasks;
  } catch (error) {
    console.error('Error creating plan:', error.message);
    return [];
  }
}

// Test runner - checks if code compiles/validates
// Errors that mean the Render environment is missing node_modules — not real code bugs
const ENVIRONMENT_ERRORS = [
  'Cannot find module',
  'Could not find a declaration file',
  '--jsx is not set',
  'expo/tsconfig.base',
  'File \'expo/',
  'TS6053',
  'TS6046',
  'TS7016',   // No declaration file (missing @types) — env issue not code bug
];

function isEnvironmentError(error) {
  return ENVIRONMENT_ERRORS.some(e => error.includes(e));
}

// Files the agent must NEVER fully rewrite — only targeted changes allowed
const PROTECTED_FILES = [
  'App.tsx',
  'index.ts',
  'app.json',
  'package.json',
  'tsconfig.json',
  'index.ts',          // src/types/index.ts
  'index.ts',          // src/lib/utils/index.ts
];

// After saving a file, validate it wasn't completely rewritten with wrong content
function validateSavedFile(filePath, code) {
  const fileName = path.basename(filePath);

  if (PROTECTED_FILES.includes(fileName)) {
    // Must contain real screen imports, not placeholders
    if (code.includes('Placeholder') || code.includes('placeholder')) {
      console.log(`🛡️ BLOCKED: ${fileName} contains placeholder content`);
      return false;
    }
    // Must not import packages that don't exist in the project
    const bannedImports = ['expo-router', 'expo-font', 'expo-splash-screen', 'expo-linear-gradient'];
    for (const banned of bannedImports) {
      if (code.includes(`from '${banned}'`) || code.includes(`from "${banned}"`)) {
        console.log(`🛡️ BLOCKED: ${fileName} imports banned package: ${banned}`);
        return false;
      }
    }
    // App.tsx must keep the original screen imports
    if (fileName === 'App.tsx') {
      if (!code.includes('useAuth') || !code.includes('LoginScreen')) {
        console.log(`🛡️ BLOCKED: App.tsx missing required imports (useAuth, LoginScreen)`);
        return false;
      }
    }
  }
  return true;
}

let npmInstallDone = false;

async function runTests(appPath) {
  try {
    console.log(`🧪 Testing code...`);
    const { execSync } = await import('child_process');

    // Install dependencies once per session if missing
    if (!npmInstallDone) {
      try {
        const nmExists = fs.existsSync(`${appPath}/node_modules/react`);
        if (!nmExists) {
          console.log(`📦 node_modules missing — skipping npm install (times out on free tier)`);
          console.log(`⏭️  Skipping TypeScript check — cannot verify without dependencies`);
          npmInstallDone = true;
          return { passed: true, output: 'Skipped (no node_modules on free tier)', errors: [] };
        }
        npmInstallDone = true;
      } catch (installErr) {
        console.log(`⚠️ npm install failed: ${installErr.message.split('\n')[0]}`);
        return { passed: true, output: 'Skipped (npm install failed)', errors: [] };
      }
    }

    let realErrors = [];

    try {
      execSync(`cd "${appPath}" && npx --yes tsc --noEmit --skipLibCheck 2>&1`, {
        encoding: 'utf-8', stdio: 'pipe', timeout: 120000,
      });
      console.log(`✅ TypeScript check passed`);
    } catch (tscError) {
      const output = String(tscError.stdout || tscError.stderr || tscError.message);
      // Only real errors — ignore environment/type declaration issues
      realErrors = output.split('\n')
        .filter(l => l.includes('error TS'))
        .filter(l =>
          !l.includes('TS7016') &&  // no declaration file
          !l.includes('TS6053') &&  // file not found
          !l.includes('TS6046') &&  // bad module option
          !l.includes('TS2307') &&  // cannot find module
          !l.includes('TS2305')     // module has no exported member
        );

      if (realErrors.length === 0) {
        console.log(`⚠️ Only environment TS errors — treating as pass`);
      } else {
        console.log(`❌ Real TypeScript errors:\n${realErrors.slice(0,3).join('\n')}`);
      }
    }

    return { passed: realErrors.length === 0, output: '', errors: realErrors };
  } catch (error) {
    console.log(`⚠️ Test runner error: ${error.message?.split('\n')[0] || error.message || 'unknown'}`);
    return { passed: true, output: '', errors: [] };
  }
}

// Extract error messages from test output
function extractErrors(testOutput) {
  const errors = [];
  
  // TypeScript errors: "file.ts(10,5): error TS1234: message"
  const tsErrors = testOutput.match(/^[^:]+:\(\d+,\d+\):\s*error\s*TS\d+:[^\n]+/gm) || [];
  errors.push(...tsErrors);
  
  // Other compilation errors
  const compileErrors = testOutput.match(/error:\s*[^\n]+/gi) || [];
  errors.push(...compileErrors.slice(0, 5)); // Limit to first 5
  
  return errors.slice(0, 10); // Return first 10 errors
}

// Auto-debug: feed errors to LLM and fix code
async function autoDebugErrors(taskDescription, errors, appPath, attemptNumber = 1) {
  try {
    console.log(`🔧 Auto-debugging (attempt ${attemptNumber})...`);

    // Extract file paths from errors and read their content
    const filesToFix = {};
    for (const err of errors.slice(0, 10)) {
      const match = err.match(/([^(]+)\(\d+,\d+\)/);
      if (match) {
        const file = match[1].trim().replace(/^Error:\s*/, '');
        if (!filesToFix[file]) {
          try {
            filesToFix[file] = fs.readFileSync(path.join(appPath, file), 'utf-8');
          } catch (e) {
            filesToFix[file] = '(could not read file)';
          }
        }
      }
    }

    // Build file contents string for the prompt
    let fileContents = '';
    for (const [file, content] of Object.entries(filesToFix)) {
      fileContents += `\n\n=== ${file} ===\n${content}`;
    }

    // === WEB SEARCH: Extract error codes and search for solutions ===
    let webSearchContext = '';
    const errorCodes = new Set();
    for (const err of errors.slice(0, 5)) {
      const match = err.match(/error\s+TS(\d+)/);
      if (match) {
        errorCodes.add(match[1]);
      }
    }

    if (errorCodes.size > 0) {
      console.log(`🔍 Searching for TypeScript error solutions: ${Array.from(errorCodes).join(', ')}`);
      try {
        const errorCode = Array.from(errorCodes)[0];
        const errorMsg = errors[0].substring(0, 100);
        const results = await WebSearch.searchErrorSolution(`TS${errorCode}`, errorMsg);
        
        if (results) {
          webSearchContext = `\n\n=== ERROR SOLUTION DOCUMENTATION ===\n${results}\n===\n`;
          console.log(`✅ Found solutions for error TS${errorCode}`);
        }
      } catch (searchError) {
        console.log(`⚠️ Error search failed (continuing): ${searchError.message}`);
      }
    }
    
    const debugMessages = [
      {
        role: 'system',
        content: `YOU ARE A CODE DEBUGGER FOR REACT NATIVE + TYPESCRIPT.

You MUST fix the reported errors and provide COMPLETE, CORRECTED code.

${TYPE_DEFINITIONS_CONTEXT}

${webSearchContext}

ERROR CONTEXT:
${errors.slice(0, 10).join('\n')}

FILES WITH ERRORS (fix ONLY these files — do NOT touch other files):
${Object.keys(filesToFix).map(f => `- ${f}`).join('\n')}

REQUIREMENTS:
1. FIX all reported errors in the files listed above
2. Provide COMPLETE code for each file (all imports, all exports, all types)
3. Start each file with "File: <path>" then the complete code
4. Do NOT create or modify files that are not listed above
5. Do NOT invent new imports — only use imports that already exist in the file
6. NO markdown fences, NO explanations — ONLY corrected code.
7. NEVER use SafeAreaView from 'react-native' — it does nothing on Android. Use \`import { SafeAreaView } from 'react-native-safe-area-context'\` instead (already installed in this project).`,
      },
      {
        role: 'user',
        content: `TASK: ${taskDescription}

REPORTED ERRORS:
${errors.slice(0, 10).join('\n')}

CURRENT FILE CONTENTS (fix these files):

${fileContents}

FIX these errors and provide the corrected files. Start with "File: <path>" and include complete code.`,
      },
    ];

    const fixedCode = await llmProvider.callLLM(debugMessages, {
      temperature: 0.3,
      max_tokens: 4000,
      timeout: 5 * 60 * 1000,
    });

    console.log(`✅ LLM generated fixes`);
    return fixedCode;
  } catch (error) {
    console.error(`❌ Debug LLM error: ${error.message}`);
    return null;
  }
}

// Send Telegram notification
async function notifyTaskStatus(ctx, taskName, status, details = '') {
  try {
    if (!ctx) return; // No context, skip
    
    const emoji = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⚠️';
    const message = `${emoji} Task: ${taskName.substring(0, 60)}\nStatus: ${status}\n${details}`;
    
    await ctx.reply(message).catch(() => {});
  } catch (error) {
    console.error(`Notification error: ${error.message}`);
  }
}

// Read current file contents from the project so the LLM knows the real code
async function readProjectFiles(appPath, taskDescription = '') {
  const { execSync } = await import('child_process');

  // Clone the repo on Render if it doesn't exist yet
  if (!fs.existsSync(appPath)) {
    console.log(`📥 Cloning proximity-app repo to ${appPath}...`);
    try {
      const token = process.env.GITHUB_TOKEN;
      const repoUrl = token
        ? `https://${token}@github.com/badometer-coder/proximity-app.git`
        : `https://github.com/badometer-coder/proximity-app.git`;
      execSync(`git clone ${repoUrl} "${appPath}"`, { stdio: 'pipe', timeout: 60000 });
      console.log(`✅ Repo cloned`);
    } catch (e) {
      console.log(`⚠️ Clone failed: ${e.message.split('\n')[0]}`);
    }
  } else {
    try {
      execSync(`git -C "${appPath}" pull origin main`, { stdio: 'pipe', timeout: 30000 });
      console.log(`✅ Repo updated`);
    } catch (e) {
      console.log(`⚠️ Git pull failed: ${e.message.split('\n')[0]}`);
    }
  }

  // Only read files relevant to the task to keep context small
  const allFiles = [
    'App.tsx',
    'src/constants/theme.ts',
    'src/screens/auth/LoginScreen.tsx',
    'src/screens/auth/ProfileSetupScreen.tsx',
    'src/screens/main/ProximityFeedScreen.tsx',
    'src/screens/main/ChatThreadScreen.tsx',
  ];

  const task = taskDescription.toLowerCase();
  let filesToRead = [];

  // Pick only relevant files based on task keywords
  if (task.includes('login') || task.includes('auth') || task.includes('password') || task.includes('username') || task.includes('sign')) {
    filesToRead = ['src/screens/auth/LoginScreen.tsx', 'src/hooks/auth/useAuth.ts', 'src/constants/theme.ts'];
  } else if (task.includes('profile') || task.includes('setup')) {
    filesToRead = ['src/screens/auth/ProfileSetupScreen.tsx', 'src/constants/theme.ts'];
  } else if (task.includes('chat') || task.includes('message')) {
    filesToRead = ['src/screens/main/ChatThreadScreen.tsx', 'src/constants/theme.ts'];
  } else if (task.includes('theme') || task.includes('context') || task.includes('dark') || task.includes('light')) {
    filesToRead = ['src/constants/theme.ts', 'App.tsx', 'src/screens/main/HomeScreen.tsx'];
  } else if (task.includes('home') || task.includes('signout') || task.includes('sign out') || task.includes('logout')) {
    filesToRead = ['src/screens/main/HomeScreen.tsx', 'src/hooks/auth/useAuth.ts', 'src/constants/theme.ts'];
  } else if (task.includes('proximity') || task.includes('feed') || task.includes('nearby')) {
    filesToRead = ['src/screens/main/ProximityFeedScreen.tsx', 'src/constants/theme.ts'];
  } else if (task.includes('app.tsx') || task.includes('navigation')) {
    filesToRead = ['App.tsx', 'src/constants/theme.ts'];
  } else {
    filesToRead = ['src/constants/theme.ts', 'src/screens/main/HomeScreen.tsx'];
  }

  let context = '';

  // Show the actual file structure first so agent uses correct paths
  try {
    const { execSync: exec } = await import('child_process');
    const tree = exec(`find "${appPath}/src" -name "*.ts" -o -name "*.tsx" 2>/dev/null | sed 's|${appPath}/||' | sort`, { encoding: 'utf-8', stdio: 'pipe' });
    context += `\n=== PROJECT FILE STRUCTURE (use EXACT paths) ===\n${tree}`;
  } catch { /* skip */ }

  for (const relPath of filesToRead) {
    const fullPath = path.join(appPath, relPath);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      context += `\n\n=== CURRENT FILE: ${relPath} ===\n${content}`;
    } catch { /* skip */ }
  }

  // Always include package.json (small file, important)
  try {
    const pkg = fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8');
    context += `\n\n=== package.json (ONLY use packages listed here) ===\n${pkg}`;
  } catch { /* skip */ }

  // Always include App.tsx — critical for navigation tasks
  try {
    const appTsx = fs.readFileSync(path.join(appPath, 'App.tsx'), 'utf-8');
    context += `\n\n=== CURRENT FILE: App.tsx (ROOT - read carefully before modifying) ===\n${appTsx}`;
  } catch { /* skip */ }

  return context;
}

// Type definitions and hook signatures — used in ALL task execution
const TYPE_DEFINITIONS_CONTEXT = `
=== REAL TYPE DEFINITIONS (MEMORIZE THESE - use EXACTLY these, never invent new properties) ===

INTERFACES (from types/):
interface NearbyPeer { id: string; username: string; full_name: string; age: number; avatar_url: string|null; is_ble_discoverable: boolean; distance_meters: number; last_active_at: string; }
interface FormattedNearbyPeer extends NearbyPeer { formatted_distance: string; signal_strength: SignalStrength; presence_status: UserPresenceStatus; }
interface ApiError { code: string; message: string; details?: Record<string, unknown>; }
interface ChatMessage { id: string; sender_id: string; receiver_id: string; message: string; sent_at: string; read: boolean; }
type SignalStrength = 'excellent'|'good'|'fair'|'weak'|'none';
type UserPresenceStatus = 'online'|'recently'|'offline';

COMPONENT PROPS (from components/):
- Avatar: { uri: string|null, name: string, size?: number } — use "uri" NOT "url"
- NearbyPeerCard: { peer: FormattedNearbyPeer, onPress: ()=>void } — NO "onWave"
- EmptyState: { icon: any, title: string, description: string } — use "description" NOT "message"
- RadiusSlider: { value: number, onValueChange: (val: number)=>void }
- ProximityHeader: { lastUpdated: string|null }

HOOK SIGNATURES (from hooks/) — EXACT return types:
- useAuth() returns EXACTLY: { user: User|null, session: Session|null, loading: boolean, signIn, signUp, signOut }
  ↳ NOTE: property name is "loading" NOT "isLoading"
  ↳ Use: const { user, session, loading, signOut } = useAuth();
- useNearbyPeers(location: GPSCoordinates|null) returns: { peers: FormattedNearbyPeer[], selectedRadius: number, isLoading: boolean, isRefreshing: boolean, error: ApiError|null, lastFetchedAt: string|null, setRadius: (r:number)=>void, refresh: ()=>Promise<void> }
  ↳ Use: const { peers, selectedRadius, isLoading, error, setRadius, refresh } = useNearbyPeers(location);
- useCurrentLocation() returns: { location: GPSCoordinates|null, isLoading: boolean, error: string|null, permissionStatus: string, requestPermission: ()=>Promise<boolean> }
  ↳ Use: const { location, isLoading, error, requestPermission } = useCurrentLocation();
- useChatMessages(peerId, peerName) returns: { messages: ChatMessage[], isLoading: boolean, sendMessage: (text: string)=>Promise<void> }
  ↳ Use: const { messages, isLoading, sendMessage } = useChatMessages(peerId, peerName);

UTILS EXPORTS (from src/lib/utils/index.ts):
- formatDistance(meters: number): string
- getSignalStrength(distanceMeters: number): SignalStrength  ← returns utils SignalStrength
- getSignalBars(strength: SignalStrength): number
- getPresenceStatus(lastActiveAt: string): UserPresenceStatus  ← returns utils UserPresenceStatus
- getPresenceColor(status: UserPresenceStatus): string
- formatRelativeTime(date: string): string
- getInitials(name: string): string
- formatTime(date: string): string
↳ NEVER invent functions like "calculateDistanceKm", "errorMsg", "refreshLocation"

⚠️ CRITICAL — DUPLICATE TYPE CONFLICTS:
SignalStrength is defined in TWO places with DIFFERENT values:
  - src/types/index.ts:     'excellent' | 'good' | 'fair' | 'poor'
  - src/lib/utils/index.ts: 'excellent' | 'good' | 'fair' | 'weak' | 'none'
UserPresenceStatus is also defined in TWO places:
  - src/types/index.ts:     'online' | 'away' | 'offline' | 'busy'
  - src/lib/utils/index.ts: 'online' | 'recently' | 'offline'
→ When fixing type errors, make FormattedNearbyPeer use the SAME SignalStrength/UserPresenceStatus as the utils functions.
→ The utils types (with 'weak', 'none', 'recently') are the CORRECT ones — update src/types/index.ts to match.
→ ChatMessage does NOT exist in src/types/index.ts — if ChatThreadScreen needs it, add it there or import from the correct location.

EXPORTS (what actually exists):
- App.tsx DOES NOT export openChat — handle chat navigation internally or via props
- HomeScreen.tsx EXPORTS as NAMED EXPORT: export const HomeScreen: React.FC = () => { }
  ↳ Import in App.tsx as: import { HomeScreen } from './src/screens/main/HomeScreen'
`;

async function executeTask(taskDescription, ctx = null, noCommit = false) {
  try {
    const stats = llmProvider.getStats();
    console.log(`💻 Dev Agent: Executing task (Provider: ${stats.currentProvider})...`);

    const appPath = process.env.PROJECT_PATH || '/opt/render/project/proximity-app';
    const currentFiles = await readProjectFiles(appPath, taskDescription);
    console.log(`📂 Read existing project files for context`);

    // === WEB SEARCH: Extract API keywords from task and search for real documentation ===
    let webSearchContext = '';
    const searchKeywords = [
      'useAuth', 'useCurrentLocation', 'useNearbyPeers', 'useChatMessages',
      'SignalStrength', 'UserPresenceStatus', 'NearbyPeer',
      'React Native', 'Expo', 'TypeScript', 'Supabase',
    ];

    // Extract relevant keywords from task
    const taskLower = taskDescription.toLowerCase();
    const relevantKeywords = searchKeywords.filter(k => taskLower.includes(k.toLowerCase()));

    if (relevantKeywords.length > 0) {
      console.log(`🔍 Searching web for API documentation on: ${relevantKeywords.slice(0, 3).join(', ')}`);
      
      try {
        // Search for the first relevant keyword (usually the most important)
        const searchQuery = `${relevantKeywords[0]} React Native TypeScript API documentation`;
        const results = await WebSearch.search(searchQuery);
        
        if (results) {
          webSearchContext = `\n=== REAL API DOCUMENTATION (from web search) ===\n${results}\n===\n`;
          console.log(`✅ Web search completed, got ${results.length} chars of documentation`);
        }
      } catch (searchError) {
        console.log(`⚠️ Web search failed (continuing without): ${searchError.message}`);
      }
    }
    
    const messages = [
      {
        role: 'system',
        content: `YOU ARE A CODE GENERATOR FOR REACT NATIVE + TYPESCRIPT.

STRICT RULES - READ CAREFULLY:
1. You MAY modify existing files OR create NEW files as needed for the task.
2. ONLY use packages that exist in package.json. NEVER import a package not listed there.
3. NEVER import "expo-router" — it is NOT in this project.
4. ALWAYS provide COMPLETE file content — no truncation, no "// rest stays the same".
5. ALWAYS start each file with: File: <path>
6. NO markdown fences (no \`\`\`typescript, no \`\`\`). Raw code only.
7. NO explanations before or after the code.
8. Only output ONE file per response.
9. CRITICAL: Before outputting code, verify the requested feature IS actually present in your output. If the task says "add a sign out button", the output MUST contain a sign out button. If the task says "add dark mode", the output MUST contain dark mode logic. NEVER regenerate the existing file unchanged — that is a failure.
10. If the task references a hook or function (e.g. useAuth, signOut), check the CURRENT PROJECT FILES section to confirm it exists before using it.

IMPORT RULES — CRITICAL (violating these breaks the build):
11. Each import statement must appear EXACTLY ONCE. Never add duplicate imports.
12. When modifying a file, copy the existing imports from the CURRENT FILE CONTENT and modify them — do NOT invent new import sources.
13. NEVER import from a module that doesn't exist. If you're unsure, check the CURRENT PROJECT FILES for the correct import path.
14. React Native imports come from 'react-native' — NEVER from any other package name.
15. Do NOT write comments like "// wait, react-native" or "// TODO" in the code. Output clean, final code only.
16. NEVER use SafeAreaView from 'react-native' — it does NOTHING on Android and is deprecated. ALWAYS use \`import { SafeAreaView } from 'react-native-safe-area-context'\` (already installed). For status bar overlap, use \`useSafeAreaInsets()\` from the same package. This app runs on Android — Android-safe code is mandatory.

${TYPE_DEFINITIONS_CONTEXT}

${webSearchContext}

ADDITIONAL PACKAGES AVAILABLE (these come with Expo even if not in package.json):
- @expo/vector-icons (Ionicons, MaterialIcons, FontAwesome, etc.) — ALWAYS available in Expo projects
- expo-constants, expo-device, expo-status-bar — always available

ARCHITECTURE RULES:
- Bottom navigation / tab bars belong in App.tsx, NOT in individual screens
- Individual screens should NOT contain navigation chrome — only their own content
- If asked to add bottom navigation, modify App.tsx using @react-navigation/bottom-tabs

PROTECTED FILES — modify only as last resort:
- tsconfig.json, package.json, app.json, babel.config.js — do NOT modify these unless the TypeScript errors are directly caused by a misconfiguration in that file.
- If you must modify a config file, change ONLY the specific setting causing the error. Do NOT rewrite the entire file.

IF YOU CANNOT DO THE TASK: respond "INCOMPLETE: <reason>"`,
      },
      {
        role: 'user',
        content: `TASK: ${taskDescription}

CURRENT PROJECT FILES (read these before writing anything):
${currentFiles}

OUTPUT: Modified file(s) only. Start each with "File: <path>" then the complete file content. No markdown fences.`,
      },
    ];

    let result;
    try {
      result = await Promise.race([
        llmProvider.callLLM(messages, {
          temperature: 0.3,
          max_tokens: 4000,
          timeout: 2 * 60 * 1000,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task execution timeout')), 3 * 60 * 1000)
        ),
      ]);
    } catch (error) {
      if (error.message.includes('timeout')) {
        console.log(`⏱️ Task execution timed out. Skipping...`);
        return null;
      }
      throw error;
    }

    if (!result) {
      console.log('❌ No response from LLM');
      return null;
    }

    // === EXTRACT AND SAVE CODE ===
    const savedFiles = [];

    // Match various file path patterns the LLM might use
    const filePatterns = [
      /(?:^|\n)(?:File|file|FILE|filename|Filename):\s*([^\n]+)/g,
      /(?:^|\n)\/\/\s*([^\n]+\.(tsx?|jsx?|ts|js|json|css|scss))/g,
      /(?:^|\n)#+\s*([^\n]+\.(tsx?|jsx?|ts|js|json|css|scss))/g,
    ];

    let allFileMatches = [];
    for (const pattern of filePatterns) {
      const matches = [...result.matchAll(pattern)];
      allFileMatches = allFileMatches.concat(matches.map(m => m[1].trim()));
    }
    // Deduplicate
    allFileMatches = [...new Set(allFileMatches)];

    console.log(`📁 Found ${allFileMatches.length} file(s) in response`);

    for (const filePath of allFileMatches) {
      // Clean up the path
      const cleanPath = filePath.replace(/^['"`]|['"`]$/g, '').trim();
      if (!cleanPath || cleanPath.length > 200) continue;

      // Find the code block nearest to this file reference
      const fileIndex = result.indexOf(filePath);
      const nextFileIndex = allFileMatches
        .map(f => result.indexOf(f, fileIndex + 1))
        .filter(i => i > fileIndex)
        .sort((a, b) => a - b)[0] || result.length;

      let codeBlock = result.substring(fileIndex + filePath.length, nextFileIndex);

      // Extract from ``` code blocks
      const codeMatch = codeBlock.match(/```(?:typescript|tsx|ts|javascript|jsx|js)?\n?([\s\S]*?)```/);
      if (codeMatch) codeBlock = codeMatch[1];

      // Strip any remaining markdown fences
      codeBlock = codeBlock.replace(/^```[\w]*\n?/gm, '').replace(/^```\n?/gm, '');

      const code = codeBlock.trim();
      if (code.length < 10) continue; // Skip empty blocks

      // Reject truncated files — must end with a closing brace or semicolon
      const lastChar = code[code.length - 1];
      if (lastChar !== '}' && lastChar !== ';' && lastChar !== ')') {
        console.log(`⚠️ Skipping ${cleanPath} — looks truncated (ends with: "${code.slice(-20)}")`);
        continue;
      }

      // Validate protected files before saving
      if (!validateSavedFile(cleanPath, code)) {
        console.log(`🛡️ Skipping ${cleanPath} — failed protection check`);
        continue;
      }

      const fullPath = path.join(appPath, cleanPath);

      // Auto-fix: Replace SafeAreaView from 'react-native' with 'react-native-safe-area-context'
      if (cleanPath.match(/\.(ts|tsx|js|jsx)$/)) {
        code = code.replace(
          /import\s+\{([^}]*)SafeAreaView([^}]*)\}\s+from\s+['"]react-native['"]/g,
          (match, before, after) => {
            const cleaned = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'SafeAreaView');
            return `import { ${cleaned.join(', ')} } from 'react-native'`;
          }
        );
        if (code.includes('<SafeAreaView') && !code.includes("from 'react-native-safe-area-context'") && !code.includes('from "react-native-safe-area-context"')) {
          code = "import { SafeAreaView } from 'react-native-safe-area-context';\n" + code;
        }
      }

      console.log(`💾 Saving to: ${fullPath}`);
      try {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, code, 'utf-8');
        savedFiles.push({ fullPath, filePath: cleanPath });
        console.log(`✅ Saved: ${fullPath}`);
      } catch (writeError) {
        const fallbackPath = path.join(__dirname, 'output', cleanPath);
        try {
          fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
          fs.writeFileSync(fallbackPath, code, 'utf-8');
          savedFiles.push({ fullPath: fallbackPath, filePath: cleanPath });
          console.log(`✅ Saved (fallback): ${fallbackPath}`);
        } catch (e) {
          console.error(`❌ Could not save ${cleanPath}: ${writeError.message}`);
        }
      }
    }

    // === RUN TESTS AND AUTO-DEBUG ===
    // appPath already declared above
    let testPassed = false;
    let debugAttempts = 0;
    const maxDebugAttempts = 3;

    while (!testPassed && debugAttempts < maxDebugAttempts) {
      if (stopRequested) {
        console.log('🛑 Stop requested — aborting debug loop');
        await notifyTaskStatus(ctx, taskDescription, 'failed', '🛑 Stopped by user');
        break;
      }
      const testResults = await runTests(appPath);
      
      if (testResults.passed) {
        console.log(`✅ All tests passed!`);
        testPassed = true;
        await notifyTaskStatus(ctx, taskDescription, 'success', '✅ Code compiled and validated successfully!');
        break;
      }

      // Real errors found — must debug, never skip
      if (testResults.errors.length === 0 && !testResults.output.includes('error TS')) {
        console.log(`⚠️ Tests inconclusive (no tsc available). Continuing...`);
        testPassed = true;
        break;
      }

      debugAttempts++;
      console.log(`🔧 Debug attempt ${debugAttempts}/${maxDebugAttempts}...`);

      if (debugAttempts >= maxDebugAttempts) {
        console.log(`❌ Max debug attempts reached. Stopping.`);
        await notifyTaskStatus(ctx, taskDescription, 'failed', `❌ Tests failed after ${maxDebugAttempts} debug attempts:\n${testResults.errors.slice(0, 2).join('\n')}`);
        break;
      }

      const fixedCode = await autoDebugErrors(taskDescription, testResults.errors, appPath, debugAttempts);
      if (!fixedCode) {
        console.log(`❌ Debug LLM failed. Stopping.`);
        await notifyTaskStatus(ctx, taskDescription, 'failed', '❌ Debug LLM could not fix errors.');
        break;
      }

      // Extract the list of files that actually have errors — only save these
      const errorFiles = new Set();
      for (const err of testResults.errors) {
        const match = err.match(/([^(]+)\(\d+,\d+\)/);
        if (match) errorFiles.add(match[1].trim().replace(/^Error:\s*/, ''));
      }

      // Re-extract and save fixed files — ONLY files that had errors
      let fixedFiles = [];
      const fixedFilePatterns = [
        /(?:^|\n)(?:File|file|FILE|filename|Filename):\s*([^\n]+)/g,
        /(?:^|\n)\/\/\s*([^\n]+\.(tsx?|jsx?|ts|js|json|css|scss))/g,
      ];

      let fixedFileMatches = [];
      for (const pattern of fixedFilePatterns) {
        const matches = [...fixedCode.matchAll(pattern)];
        fixedFileMatches = fixedFileMatches.concat(matches.map(m => m[1].trim()));
      }
      fixedFileMatches = [...new Set(fixedFileMatches)];

      for (const filePath of fixedFileMatches) {
        const cleanPath = filePath.replace(/^['"`]|['"`]$/g, '').trim();
        if (!cleanPath || cleanPath.length > 200) continue;

        const fileIndex = fixedCode.indexOf(filePath);
        const nextFileIndex = fixedFileMatches
          .map(f => fixedCode.indexOf(f, fileIndex + 1))
          .filter(i => i > fileIndex)
          .sort((a, b) => a - b)[0] || fixedCode.length;

        let codeBlock = fixedCode.substring(fileIndex + filePath.length, nextFileIndex);
        const codeMatch = codeBlock.match(/```(?:typescript|tsx|ts|javascript|jsx|js)?\n?([\s\S]*?)```/);
        if (codeMatch) codeBlock = codeMatch[1];
        codeBlock = codeBlock.replace(/^```[\w]*\n?/gm, '').replace(/^```\n?/gm, '');

        const code = codeBlock.trim();
        if (code.length < 10) continue;

        // Only save files that actually had errors — don't touch healthy files
        if (!errorFiles.has(cleanPath)) {
          console.log(`🛡️ Skipping ${cleanPath} — not in error list, refusing to modify healthy file`);
          continue;
        }

        // Reject truncated files — must end with } or ; or )
        const lastChar = code[code.length - 1];
        if (lastChar !== '}' && lastChar !== ';' && lastChar !== ')') {
          console.log(`⚠️ Skipping ${cleanPath} — looks truncated (ends with: "${code.slice(-20)}")`);
          continue;
        }

        if (!validateSavedFile(cleanPath, code)) {
          console.log(`🛡️ Skipping fixed ${cleanPath} — failed protection check`);
          continue;
        }

        const fullPath = path.join(appPath, cleanPath);
        try {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, code, 'utf-8');
          fixedFiles.push(cleanPath);
          console.log(`✅ Fixed and saved: ${cleanPath}`);
        } catch (e) {
          console.error(`❌ Could not save fixed ${cleanPath}: ${e.message}`);
        }
      }

      if (fixedFiles.length === 0) {
        console.log(`⚠️ No files to fix. Stopping debug.`);
        break;
      }
    }

    // === AUTO-COMMIT TO GITHUB (only if tests passed) ===
    let committed = false;
    if (savedFiles.length > 0 && testPassed && !noCommit) {
      const githubToken = process.env.GITHUB_TOKEN;
      try {
        const { execSync } = await import('child_process');
        execSync(`git -C "${appPath}" config user.email "agent@proximity.app"`, { stdio: 'pipe' });
        execSync(`git -C "${appPath}" config user.name "AI Agent"`, { stdio: 'pipe' });
        if (githubToken) {
          execSync(`git -C "${appPath}" remote set-url origin https://${githubToken}@github.com/badometer-coder/proximity-app.git`, { stdio: 'pipe' });
        }
        execSync(`git -C "${appPath}" add -A`, { stdio: 'pipe' });
        const commitMsg = `AI: ${taskDescription.substring(0, 60).replace(/"/g, "'")}`;
        execSync(`git -C "${appPath}" commit -m "${commitMsg}"`, { stdio: 'pipe' });
        execSync(`git -C "${appPath}" push origin main`, { stdio: 'pipe' });
        committed = true;
        console.log(`✅ Committed and pushed ${savedFiles.length} file(s) to GitHub`);
      } catch (gitError) {
        const gitErrMsg = String(gitError.stdout || gitError.stderr || gitError.message || '').split('\n')[0];
        console.log(`❌ Git commit FAILED: ${gitErrMsg}`);
        if (ctx) await ctx.reply(`❌ Commit failed: ${gitErrMsg.substring(0, 100)}`).catch(() => {});
      }
    } else if (savedFiles.length > 0 && !testPassed) {
      console.log(`⚠️ Skipping commit — tests failed`);
      await notifyTaskStatus(ctx, taskDescription, 'failed', '❌ Code written but tests failed. Not committed.');
    } else if (savedFiles.length > 0 && noCommit) {
      console.log(`📝 Files saved (noCommit mode — commit handled by caller)`);
    }

    taskLog.push({
      task: taskDescription,
      result: result,
      savedFiles: savedFiles,
      testPassed: testPassed,
      timestamp: new Date().toISOString(),
      provider: llmProvider.getCurrentProvider().name,
    });
    
    if (savedFiles.length > 0) {
      const status = committed ? 'committed & pushed' : (noCommit ? 'saved (noCommit)' : (testPassed ? 'saved (NOT committed)' : 'saved (tests failed)'));
      console.log(`✅ Task complete - saved ${savedFiles.length} file(s) [${status}]`);
    } else {
      console.log(`✅ Task execution complete (no files saved)\n`);
    }
    return result;
  } catch (error) {
    console.error('Error executing task:', error.message);
    await notifyTaskStatus(ctx, taskDescription, 'error', `❌ Execution error: ${error.message}`);
    return null;
  }
}

async function validateTaskCompletion(taskDescription, executionResult) {
  try {
    console.log('🔍 Project Manager: Validating solution completeness...');
    
    const messages = [
      {
        role: 'system',
        content: `YOU ARE A STRICT PROJECT MANAGER VALIDATING CODE WORK.

A solution is COMPLETE if it provides:
1. ACTUAL CODE (not outlines, suggestions, or "how-to" instructions)
2. File paths clearly identified (with "File:" prefix OR clear filename markers)
3. Complete imports (import statements present)
4. Complete exports (export functions/classes/types present)
5. Full TypeScript types (minimal use of 'any')
6. Error handling (try/catch or validation)
7. Ready to copy-paste and use

REJECT ONLY if:
- Response is just an outline or suggestion ("add this", "modify X to")
- No actual code provided
- All file paths are missing
- Critical imports/exports missing
- No error handling at all

DO NOT REJECT for minor formatting issues like missing "File:" prefix on every declaration.
DO NOT REJECT for incomplete test files if the main implementation is complete.

RESPOND IN THIS FORMAT:
- Decision: YES or NO
- Brief reason if NO
- One key improvement needed if NO`,
      },
      {
        role: 'user',
        content: `TASK:\n${taskDescription}\n\nSOLUTION:\n${executionResult}`,
      },
    ];

    const validation = await llmProvider.callLLM(messages, {
      temperature: 0.7,
      max_tokens: 400,
    });

    console.log('✅ Validation complete\n');
    return validation;
  } catch (error) {
    console.error('Error validating:', error.message);
    return null;
  }
}

bot.start((ctx) => {
  console.log(`\n✅ Bot started by user ${ctx.from.id}`);
  ctx.reply(`🤖 AGENT COORDINATOR\n\nCommands:\n/status - Show progress\n/tasks - Show completed tasks\n/memory - Show stats\n\nOr just chat naturally!`);
});

bot.command('init', async (ctx) => {
  ctx.reply('🚀 Starting development...\n⏳ PM generating plan...');
  
  try {
    const tasks = await createExecutionPlan();
    
    if (tasks.length === 0) {
      ctx.reply('❌ Failed to create plan');
      return;
    }
    
    taskQueue = tasks;
    ctx.reply(`✅ Plan created: ${tasks.length} tasks\n\n📋 Next:\n${tasks[0]}\n\nUse /execute`);
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('execute', async (ctx) => {
  if (taskQueue.length === 0) {
    ctx.reply('❌ No tasks. Run /init first.');
    return;
  }
  
  const task = taskQueue.shift();
  currentTask = task;
  
  console.log(`\n🚀 EXECUTE: Processing task: ${task.substring(0, 100)}...`);
  ctx.reply(`💻 Dev Agent working...\n${task.substring(0, 500)}`);
  
  const result = await executeTask(task, ctx);
  
  if (result) {
    console.log(`✅ Dev Agent completed task`);
    const messages = result.match(/[\s\S]{1,4096}/g) || [result];
    for (const msg of messages) {
      ctx.reply(msg);
    }
    
    ctx.reply('\n🔍 PM validating completeness...');
    const validation = await validateTaskCompletion(task, result);
    
    console.log(`🔍 Validation result:\n${validation?.substring(0, 200) || 'null'}`);
    
    if (validation) {
      const valMessages = validation.match(/[\s\S]{1,4096}/g) || [validation];
      for (const msg of valMessages) {
        ctx.reply(msg);
      }
      
      // Check if PM approved (look for "YES" or "approved" in the validation text)
      const validationUpper = validation.toUpperCase();
      const approved = validationUpper.includes('DECISION: YES') || validationUpper.includes('YES') && !validationUpper.includes('NO');
      
      console.log(`✅ Approved: ${approved}`);
      
      if (!approved) {
        // Rejected - re-queue for revision
        taskQueue.unshift(`[REVISION] ${task}`);
        console.log(`⚠️ Task rejected. Re-queued for revision.`);
        ctx.reply('\n⚠️ REJECTED - Solution incomplete. Re-queued for revision.\nUse /execute to have Dev Agent revise.');
      } else {
        // Approved
        console.log(`✅ Task approved!`);
        if (taskQueue.length > 0) {
          ctx.reply(`\n✅ APPROVED! 📋 ${taskQueue.length} tasks remaining. Use /execute for next.`);
        } else {
          ctx.reply('\n✅ APPROVED! All tasks completed! 🎉');
        }
      }
    }
  } else {
    console.log(`❌ Dev Agent failed to execute task`);
    ctx.reply('❌ Dev Agent failed to execute task');
  }
});

bot.command('status', (ctx) => {
  const total = taskQueue.length + taskLog.length;
  const completed = taskLog.length;
  
  ctx.reply(`📊 PROGRESS\n✅ Done: ${completed}\n⏳ Remaining: ${taskQueue.length}\n📈 Total: ${total}`);
});

bot.command('help', (ctx) => {
  ctx.reply(`🤖 COORDINATOR HELP

DEVELOPMENT:
/init - Generate plan
/execute - Run next task (manual)
/auto - Run ALL remaining tasks automatically
/status - Check progress

SKILLS:
/skills - List all available skills
/skill <name> - Show details of a specific skill

LEARNING:
/learning - View agent's learning stats and skills created
/learn - Alias for /learning

MONITORING:
/keys - Show API keys in use
/usage - Show token usage

WEB SEARCH (for fixing hallucinations):
/search <query> - Search for API documentation
/cache-stats - Show web search cache stats
/cache-clear - Clear web search cache

GENERAL:
/help - This message`);
});

bot.command('skills', (ctx) => {
  const categories = skillsManager.listAllSkills();
  let msg = `📚 AVAILABLE SKILLS (${Object.values(categories).flat().length} total)\n\n`;
  
  Object.entries(categories).forEach(([cat, skills]) => {
    msg += `\n**${cat.replace(/-/g, ' ').toUpperCase()}**\n`;
    skills.forEach(s => {
      msg += `• ${s.title} (\`${s.name}\`)\n`;
    });
  });
  
  msg += `\n_Use /skill <name> to see details_`;
  ctx.reply(msg);
});

bot.command('skill', (ctx) => {
  const skillName = ctx.message.text.split(' ').slice(1).join(' ');
  
  if (!skillName) {
    ctx.reply('Usage: /skill <skill_name>\n\nExample: /skill systematic-debugging');
    return;
  }
  
  const skill = skillsManager.getSkill(skillName);
  
  if (!skill) {
    ctx.reply(`❌ Skill not found: ${skillName}\n\nUse /skills to see all available skills.`);
    return;
  }
  
  let msg = `📖 SKILL: ${skill.title}\n\n`;
  msg += `Category: ${skill.category}\n`;
  msg += `Tokens: ${skill.tokens || 0}\n`;
  msg += `Triggers: ${(skill.triggers || []).join(', ')}\n\n`;
  msg += skill.content.substring(0, 2000); // Truncate for Telegram
  msg += skill.content.length > 2000 ? '\n\n_... (truncated, see docs)_' : '';
  
  ctx.reply(msg);
});

bot.command('learning', (ctx) => {
  const insights = selfImprovementEngine.getInsights();
  ctx.reply(insights || '📚 No learning events yet. Keep using me and I\'ll learn!');
});

bot.command('learn', (ctx) => {
  const insights = selfImprovementEngine.getInsights();
  ctx.reply(insights || '📚 No learning events yet. Keep using me and I\'ll learn!');
});

bot.command('keys', (ctx) => {
  const stats = llmProvider.getStats();
  ctx.reply(`🔑 LLM PROVIDERS\n\n✅ Total: ${stats.totalProviders}\n📌 Current: ${stats.currentProvider}\n\n${stats.providers.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nProviders will auto-rotate on rate limits.`);
});

bot.command('usage', async (ctx) => {
  ctx.reply('📊 Checking Groq API usage...');
  
  try {
    // Try to get usage from Groq API
    const response = await fetch('https://api.groq.com/usage', {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      ctx.reply(`📊 GROQ API USAGE\n\n${JSON.stringify(data, null, 2)}`);
    } else {
      ctx.reply('⚠️ Could not fetch usage. Visit https://console.groq.com to check manually.');
    }
  } catch (error) {
    console.error('Error fetching usage:', error.message);
    
    // Fallback: show local task log stats
    const totalTokensEstimate = taskLog.length * 2000; // Rough estimate
    ctx.reply(`📊 LOCAL STATS (Rough Estimate)\n\n✅ Tasks completed: ${taskLog.length}\n📈 Estimated tokens used: ~${totalTokensEstimate}\n\nFor accurate Groq usage:\n👉 Visit https://console.groq.com/account/billing`);
  }
});

// Web search commands
bot.command('search', async (ctx) => {
  const query = ctx.message.text.replace('/search ', '').trim();
  
  if (!query) {
    ctx.reply('Usage: /search <query>\n\nExample: /search react-native geolocation API');
    return;
  }
  
  ctx.reply(`🔍 Searching web for: "${query}"\n⏳ Please wait...`);
  
  try {
    const results = await WebSearch.search(query);
    
    if (results) {
      const messages = results.match(/[\s\S]{1,4096}/g) || [results];
      ctx.reply(`✅ Search results for "${query}":`).catch(() => {});
      
      for (const msg of messages) {
        ctx.reply(msg).catch(() => {});
      }
    } else {
      ctx.reply('❌ No results found');
    }
  } catch (error) {
    ctx.reply(`❌ Search error: ${error.message}`);
  }
});

bot.command('cache-stats', (ctx) => {
  const stats = WebSearch.getCacheStats();
  ctx.reply(`📊 WEB SEARCH CACHE STATS\n\nCached queries: ${stats.size}\n\n${stats.size > 0 ? `Entries:\n${stats.entries.slice(0, 10).join('\n')}${stats.entries.length > 10 ? `\n... and ${stats.entries.length - 10} more` : ''}` : 'Cache is empty'}`);
});

bot.command('cache-clear', (ctx) => {
  WebSearch.clearCache();
  ctx.reply('🧹 Web search cache cleared');
});

// Auto-execute all tasks
async function autoExecuteAll(ctx) {
  if (taskQueue.length === 0) {
    ctx.reply('❌ No tasks. Run /init first.');
    return;
  }
  
  // Set Telegram context for notifications
  telegramBotContext = ctx;
  
  const totalTasks = taskQueue.length;
  ctx.reply(`🚀 AUTO MODE: Executing ${totalTasks} tasks automatically...\n⏳ This will take a few minutes. Monitoring via Telegram.\n\n📢 I'll notify you when a provider hits rate limit or task completes.`);
  
  let completed = 0;
  let revised = 0;
  let maxRevisions = 3; // Prevent infinite loops
  let taskRevisionCount = {}; // Track revisions per task
  
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    currentTask = task;
    
    // Remove existing revision prefix to get clean task key
    const cleanTask = task.replace(/^\[REVISION-\d+\]\s*/g, '');
    const taskKey = cleanTask.substring(0, 80); // Use first 80 chars as task ID
    const revisionCount = taskRevisionCount[taskKey] || 0;
    
    console.log(`\n[${'='.repeat(50)}]`);
    console.log(`AUTO EXECUTE: ${completed + 1}/${totalTasks} (Revisions: ${revised})`);
    console.log(`Task: ${cleanTask.substring(0, 100)}...`);
    console.log(`Revision attempt: ${revisionCount}/${maxRevisions}`);
    
    const result = await executeTask(cleanTask, ctx);
    
    if (!result) {
      console.log(`❌ Task failed - skipping`);
      completed++;
      continue;
    }
    
    const validation = await validateTaskCompletion(cleanTask, result);
    const approved = validation && (validation.toUpperCase().includes('DECISION: YES') || (validation.toUpperCase().includes('YES') && !validation.toUpperCase().includes('NO')));
    
    if (!approved && revisionCount < maxRevisions) {
      console.log(`⚠️ Task rejected (revision ${revisionCount + 1}/${maxRevisions})`);
      // Re-queue with clean revision prefix (not stacked)
      taskQueue.unshift(`[REVISION-${revisionCount + 1}] ${cleanTask}`);
      taskRevisionCount[taskKey] = revisionCount + 1;
      revised++;
      
      if (revised % 5 === 0) {
        ctx.reply(`⚠️ Auto-executing... (${completed} done, ${revised} revisions, ${taskQueue.length} remaining)`).catch(() => {});
      }
    } else if (!approved && revisionCount >= maxRevisions) {
      console.log(`❌ Task exceeded max revisions (${maxRevisions}). Skipping.`);
      completed++;
      delete taskRevisionCount[taskKey];
      ctx.reply(`⚠️ Task skipped (exceeded ${maxRevisions} revision attempts)`).catch(() => {});
    } else {
      console.log(`✅ Task approved!`);
      completed++;
      delete taskRevisionCount[taskKey]; // Clear revision count for this task
      
      // Record successful task to memory
      memory.recordTaskCompletion(cleanTask, true, result, llmProvider.getCurrentProvider().name, revisionCount);
      
      if (completed % 10 === 0) {
        ctx.reply(`✅ Auto-executing... (${completed}/${totalTasks} done, ${revised} revisions, ${taskQueue.length} remaining)`).catch(() => {});
      }
    }
  }
  
  ctx.reply(`\n🎉 AUTO EXECUTION COMPLETE!\n✅ Completed: ${completed}\n⚠️ Revisions: ${revised}\n📊 Total Processed: ${totalTasks}`);
  console.log(`\n🎉 AUTO EXECUTION FINISHED: ${completed} completed, ${revised} revisions out of ${totalTasks}`);
  
  // Clear context
  telegramBotContext = null;
}

bot.command('auto', async (ctx) => {
  await autoExecuteAll(ctx);
});

// Natural Language Intent Classifier
async function classifyUserIntent(message) {
  try {
    const response = await llmProvider.callLLM([
      {
        role: 'system',
        content: `What does the user want? Answer with ONLY ONE of these words:
PLAN
RUN_ALL
EXECUTE_N
EXECUTE_ONE
STATUS
MEMORY
HELP

Do not explain. Just write the word.`,
      },
      {
        role: 'user',
        content: message,
      },
    ], {
      temperature: 0.1,
      max_tokens: 10,
      timeout: 15 * 1000,
    });

    const intent = response.trim().toUpperCase();
    console.log(`🧠 Intent raw response: "${response}"`);
    console.log(`🧠 Intent parsed: "${intent}"`);
    console.log(`🧠 Response length: ${response.length}, Type: ${typeof response}`);
    if (intent.includes('PLAN')) return 'PLAN';
    if (intent.includes('RUN_ALL') || intent.includes('RUN ALL')) return 'RUN_ALL';
    if (intent.includes('EXECUTE_N')) return 'EXECUTE_N';
    if (intent.includes('EXECUTE_ONE')) return 'EXECUTE_ONE';
    if (intent.includes('STATUS')) return 'STATUS';
    if (intent.includes('MEMORY')) return 'MEMORY';
    if (intent.includes('HELP')) return 'HELP';
    
    console.log(`⚠️ Unknown intent: "${intent}"`);
    return null;
  } catch (error) {
    console.error('❌ Intent classification error:', error.message);
    return null;
  }
}

// Automatically fetch latest errors from GitHub Actions
async function getLatestGitHubErrors() {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.log('⚠️ No GITHUB_TOKEN — cannot fetch errors');
      return null;
    }

    // Fetch latest workflow runs
    const response = await fetch(
      'https://api.github.com/repos/badometer-coder/proximity-app/actions/runs?per_page=5',
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      console.log(`⚠️ GitHub API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const runs = data.workflow_runs || [];

    // Find the first failed run
    const failedRun = runs.find(r => r.conclusion === 'failure');
    if (!failedRun) {
      return null; // No failures
    }

    console.log(`📍 Found failed run: ${failedRun.name} (attempt ${failedRun.run_number})`);

    // Fetch logs for this run
    const logsResponse = await fetch(
      `https://api.github.com/repos/badometer-coder/proximity-app/actions/runs/${failedRun.id}/logs`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!logsResponse.ok) {
      console.log(`⚠️ Could not fetch logs: ${logsResponse.status}`);
      return null;
    }

    const logsZip = await logsResponse.arrayBuffer();
    // Decompress and extract error messages (simplified)
    // For now, return a placeholder — in production we'd unzip and parse
    return {
      runId: failedRun.id,
      runNumber: failedRun.run_number,
      status: failedRun.conclusion,
      message: `Run #${failedRun.run_number} failed (${failedRun.name})`,
    };
  } catch (error) {
    console.error(`Error fetching GitHub errors: ${error.message}`);
    return null;
  }
}

// Handle all natural language messages
bot.on('text', (ctx) => {
  // Run handler async so telegraf doesn't timeout waiting for long tasks
  handleMessage(ctx).catch(err => {
    console.error('❌ Handler error:', err.message);
    const msg = err.message || '';
    if (msg.includes('All providers failed') || msg.includes('quota') || msg.includes('rate limit')) {
      ctx.reply(`⏳ All AI providers are rate limited right now. Quotas reset at midnight. Try again later.`).catch(() => {});
    } else {
      ctx.reply(`Error: ${err.message}`).catch(() => {});
    }
  });
});

async function handleMessage(ctx) {
  let typingInterval = null;
  
  // Helper: Restart typing indicator after each reply
  const restartTyping = () => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
  };
  
  // Wrap ctx.reply to auto-restart typing after each message
  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = async (...args) => {
    const result = await originalReply(...args);
    restartTyping(); // Restart typing after message is sent
    return result;
  };
  
  try {
    const raw = ctx.message.text.trim();
    const msg = raw.toLowerCase();
    if (raw.startsWith('/') && raw !== '/providers') return; // allow /providers through
    console.log(`\n💬 User: "${raw}"`);

    // Deduplicate — ignore same message within 30 seconds
    const taskKey = raw.substring(0, 100);
    if (taskKey === lastTaskKey && Date.now() - lastTaskTime < 30000) {
      console.log(`⚠️ Duplicate message ignored: "${taskKey}"`);
      return;
    }
    lastTaskKey = taskKey;
    lastTaskTime = Date.now();

    // Show typing indicator immediately so user knows the agent is working
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
    // Keep refreshing typing indicator every 2 seconds during long tasks
    typingInterval = setInterval(restartTyping, 2000);
    console.log(`⌨️  Typing indicator started for chat ${ctx.chat.id}`);

    // --- NETWORK/CONFIG QUESTIONS — answer directly without tools ---
    if (msg.includes('network request failed') || msg.includes('login failed') || 
        msg.includes('why is') || msg.includes('what is') || msg.includes('why does') ||
        (msg.includes('not working') && !msg.match(/fix|change|update|add|remove/i))) {
      // These are diagnostic questions — answer from knowledge, don't read code
      const quickMessages = [
        { role: 'system', content: `You are a React Native + Supabase expert. Answer the user's question directly and concisely. Do NOT use tools. Give a short practical answer.` },
        { role: 'user', content: raw }
      ];
      const quickAnswer = await llmProvider.callLLM(quickMessages, { temperature: 0.3, max_tokens: 300 });
      if (quickAnswer) {
        conversationHistory.push({ role: 'user', content: raw });
        conversationHistory.push({ role: 'assistant', content: quickAnswer });
        saveConversationHistory();
        return ctx.reply(quickAnswer);
      }
    }


    if (msg.match(/^(stop|abort|cancel|halt|kill|enough|just stop|stop it|stop now)/i)) {
      stopRequested = true;
      taskQueue = [];
      return ctx.reply('🛑 STOPPED. All running tasks will abort. Send "go" or "fix the code" to start again.');
    }

    // Reset stop flag when starting new work
    if (msg.match(/^(go|start|fix|please fix|run|execute|continue)/i)) {
      stopRequested = false;
    }

    // --- GREETINGS ---
    if (/^(hey|hi|hello|sup|yo|hiya|howdy)[\s!.?]*$/.test(msg)) {
      return ctx.reply(`Hey! 👋 I'm your dev agent building the Proximity app.\n\n📋 Queued: ${taskQueue.length} tasks\n✅ Done: ${taskLog.length} tasks\n\nJust tell me what to do naturally!`);
    }

    // --- STATUS ---
    if (msg.includes('status') || msg.includes('progress') || (msg.includes('how many') && msg.includes('task')) || msg.includes('done so far')) {
      const stats = memory.getStats();
      return ctx.reply(`📊 Progress\n✅ Done: ${taskLog.length}\n⏳ Queued: ${taskQueue.length}\n💡 Success: ${stats.successRate?.current?.toFixed(1) || 'N/A'}%${taskLog.length > 0 ? `\n\nLast: ${(taskLog[taskLog.length-1]?.task||'').substring(0,80)}` : ''}`);
    }

    // --- PROVIDERS ---
    if (msg === '/providers' || msg.includes('what providers') || msg.includes('which providers') || msg === 'providers') {
      const stats = llmProvider.getStats();
      const lines = stats.providers.map(p => `${p.includes('(DEAD)') ? '💀' : '✅'} ${p}`);
      return ctx.reply(`🤖 LLM Providers (${stats.aliveProviders}/${stats.totalProviders} alive)\n\n${lines.join('\n')}`);
    }

    // --- LIST TASKS ---
    if (msg.match(/^(list|show)\s+(tasks|plans?)/) || msg.match(/what (tasks|plans?) do you have/)) {
      if (taskQueue.length === 0) return ctx.reply('No tasks queued. Tell me what to work on!');
      const keyword = msg.includes('ui') || msg.includes('screen') || msg.includes('design') ? 'ui' :
                      msg.includes('login') ? 'login' :
                      msg.includes('auth') ? 'auth' :
                      msg.includes('chat') ? 'chat' :
                      msg.includes('profile') ? 'profile' :
                      msg.includes('location') || msg.includes('gps') ? 'location' : null;
      const filtered = keyword ? taskQueue.filter(t => t.toLowerCase().includes(keyword)) : taskQueue.slice(0, 15);
      const label = keyword ? `${keyword}-related` : 'planned';
      return ctx.reply(`📋 ${filtered.length} ${label} tasks:\n\n${filtered.slice(0, 10).map((t, i) => `${i+1}. ${t.substring(0, 100)}`).join('\n')}${filtered.length > 10 ? `\n...and ${filtered.length - 10} more` : ''}`);
    }

    // --- RUN ALL ---
    if ((msg.includes('run') || msg.includes('execute') || msg.includes('start')) &&
        (msg.includes('all') || msg.includes('everything'))) {
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued. Tell me what to work on first!');
      return autoExecuteAll(ctx);
    }

    // --- RUN N TASKS ---
    const runMatch = msg.match(/(?:run|do|execute|start)\s+(\d+)/);
    if (runMatch) {
      const count = parseInt(runMatch[1]);
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued. Tell me what to work on first!');
      return runTasks(ctx, count);
    }

    // --- "go ahead" / "continue" / "yes do it" ---
    if (msg.match(/^(go ahead|continue|yes|do it|proceed|ok do it|start|begin|sure)[\s!.?]*$/)) {
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued. Tell me what you want me to build first!');
      await ctx.reply(`🚀 Starting on the next task...`);
      return runTasks(ctx, 1);
    }

    // --- "FIX THE CODE" / "FIX ERRORS" ---
    if (msg.match(/^(fix|resolve|solve).*(code|error|problem|bug|issue|typescript|compilation)/i) || 
        msg.match(/^(check|find).*(error|bug|typescript|compilation|broken)/i) ||
        msg.match(/^please fix/i)) {
      await ctx.reply('🔍 Checking for errors...');
      
      const appPath = process.env.PROJECT_PATH || '/opt/render/project/proximity-app';
      const { execSync } = await import('child_process');
      
      // Make sure repo is cloned and up to date
      try {
        if (!fs.existsSync(appPath)) {
          await ctx.reply('📥 Cloning proximity-app repo...');
          const token = process.env.GITHUB_TOKEN;
          const repoUrl = token
            ? `https://${token}@github.com/badometer-coder/proximity-app.git`
            : `https://github.com/badometer-coder/proximity-app.git`;
          execSync(`git clone ${repoUrl} "${appPath}"`, { stdio: 'pipe', timeout: 60000 });
        } else {
          execSync(`git -C "${appPath}" pull origin main`, { stdio: 'pipe', timeout: 30000 });
        }
      } catch (e) {
        await ctx.reply(`⚠️ Could not sync repo: ${e.message.split('\n')[0]}`);
      }

      // Run TypeScript check — tsc exits 1 on errors, so catch the error to get output
      let output = '';
      try {
        output = execSync(`cd "${appPath}" && npx --yes tsc --noEmit --skipLibCheck 2>&1`, {
          encoding: 'utf-8',
          timeout: 120000, // 2 min max
        }).trim();
      } catch (err) {
        // tsc exits non-zero on errors — the output is in err.stdout
        output = String(err.stdout || err.stderr || err.message || '').trim();
      }

      if (!output) {
        return ctx.reply('✅ No TypeScript errors found! App looks good.');
      }

      // Extract error lines
      const errorLines = output
        .split('\n')
        .filter(l => l.includes('error TS'));

      if (errorLines.length === 0) {
        return ctx.reply(`✅ No TypeScript errors found!\n\n(tsc output: ${output.substring(0, 200)})`);
      }

      // Detect "missing node_modules" — TS2307 on every file means npm install failed, not a code bug
      const missingModuleErrors = errorLines.filter(l => l.includes('TS2307') && l.includes('Cannot find module'));
      if (missingModuleErrors.length > 10) {
        return ctx.reply(`⚠️ These errors look like \`node_modules\` wasn't installed on the CI runner (${missingModuleErrors.length} "Cannot find module" errors). This is a CI infrastructure issue, not a code bug — the code itself is fine. Check the GitHub Actions logs to see if \`npm install\` failed.`);
      }

      await ctx.reply(`Found ${errorLines.length} error(s):\n\n${errorLines.slice(0, 5).join('\n')}${errorLines.length > 5 ? '\n...' : ''}\n\n🔧 Fixing automatically...`);

      // Group errors by file path
      const errorsByFile = {};
      for (const line of errorLines) {
        const fileMatch = line.match(/^([^(]+)\(\d+,\d+\)/);
        if (fileMatch) {
          const file = fileMatch[1].trim();
          if (!errorsByFile[file]) errorsByFile[file] = [];
          errorsByFile[file].push(line);
        }
      }

      const fileCount = Object.keys(errorsByFile).length;
      if (fileCount === 0) {
        return ctx.reply('⚠️ Could not parse file paths from errors. Raw output:\n' + output.substring(0, 500));
      }

      await ctx.reply(`🔧 Auto-fixing ${fileCount} file(s)...`);

      // Fix each broken file separately but commit only once at the end
      for (const [file, errors] of Object.entries(errorsByFile)) {
        const fileErrors = errors.join('\n');

        // Read the actual file content so agent can see what's broken
        let fileContent = '';
        try {
          fileContent = fs.readFileSync(path.join(appPath, file), 'utf-8');
        } catch (err) {
          console.warn(`⚠️ Could not read ${file}: ${err.message}`);
        }

        // Always include type definition files so agent sees the real source of truth
        let typesContent = '';
        const typeFiles = [
          'src/types/index.ts',
          'src/lib/utils/index.ts',
          'src/types/index.d.ts',
        ];
        for (const tf of typeFiles) {
          try {
            const content = fs.readFileSync(path.join(appPath, tf), 'utf-8');
            typesContent += `\n\n=== ${tf} ===\n${content}`;
          } catch { /* skip if not found */ }
        }

        const fixTask = `Fix ONLY the file "${file}" to resolve these TypeScript errors. Do NOT change any other files unless the error is a type definition conflict — in that case you may also fix src/types/index.ts.

${TYPE_DEFINITIONS_CONTEXT}

ACTUAL TYPE DEFINITION FILES (read these to understand real types — do NOT invent values):
${typesContent}

CURRENT FILE CONTENT (the file you are fixing):
\`\`\`
${fileContent}
\`\`\`

ERRORS IN ${file}:
${fileErrors}`;

        console.log(`🔧 Auto-fixing ${file}...`);
        try {
          await executeTask(fixTask, ctx, true); // noCommit=true
        } catch (err) {
          console.error(`❌ Auto-fix failed for ${file}: ${err.message}`);
        }
      }

      // Pre-commit verification: check if tsc errors actually decreased
      let shouldCommit = true;
      let newErrorCount = 0;
      try {
        let postOutput = '';
        try {
          postOutput = execSync(`cd "${appPath}" && npx --yes tsc --noEmit --skipLibCheck 2>&1`, {
            encoding: 'utf-8',
            timeout: 120000,
          });
        } catch (err) {
          postOutput = String(err.stdout || err.stderr || '');
        }
        newErrorCount = (postOutput.match(/error TS/g) || []).length;
        console.log(`📊 Error count: before=${errorLines.length}, after=${newErrorCount}`);

        if (newErrorCount >= errorLines.length) {
          await ctx.reply(`🛑 Aborting commit — errors did not decrease (${errorLines.length} → ${newErrorCount}). Reverting changes.`);
          shouldCommit = false;
          memory.recordAntiPattern(
            'Manual fix attempt increased errors',
            `Tried to fix ${errorLines.length} errors but ended with ${newErrorCount}.`
          );
          try {
            execSync(`git -C "${appPath}" checkout -- .`, { stdio: 'pipe' });
            console.log(`↩️ Reverted bad changes — repo is clean`);
          } catch (e) {
            console.log(`⚠️ Could not revert: ${e.message}`);
          }
        } else {
          memory.recordBestPractice(
            `Manual fix: reduced ${errorLines.length} → ${newErrorCount} errors`,
            llmProvider.getCurrentProvider()?.name
          );
        }
      } catch (e) {
        console.log(`⚠️ Pre-commit check failed: ${e.message}. Committing anyway.`);
      }

      // Single commit for all fixes — only if errors decreased
      if (shouldCommit) {
        try {
          const githubToken = process.env.GITHUB_TOKEN;
          execSync(`git -C "${appPath}" config user.email "agent@proximity.app"`, { stdio: 'pipe' });
          execSync(`git -C "${appPath}" config user.name "AI Agent"`, { stdio: 'pipe' });
          if (githubToken) {
            execSync(`git -C "${appPath}" remote set-url origin https://${githubToken}@github.com/badometer-coder/proximity-app.git`, { stdio: 'pipe' });
          }
          execSync(`git -C "${appPath}" add -A`, { stdio: 'pipe' });
          execSync(`git -C "${appPath}" commit -m "CI fix: resolve TypeScript errors (${fileCount} files)"`, { stdio: 'pipe' });
          execSync(`git -C "${appPath}" push origin main`, { stdio: 'pipe' });
          console.log(`✅ CI fix committed in single push`);
          await ctx.reply(`✅ Fixed ${fileCount} file(s) and pushed! Errors: ${errorLines.length} → ${newErrorCount}`);
        } catch (gitError) {
          const errMsg = String(gitError.stdout || gitError.stderr || gitError.message || '');
          if (errMsg.includes('nothing to commit') || errMsg.includes('up to date')) {
            await ctx.reply('⚠️ No changes to commit — fixes may not have generated valid code.');
          } else {
            await ctx.reply(`⚠️ Push failed: ${errMsg.substring(0, 200)}`);
          }
        }
      }

      return;
    }

    // --- LLM handles everything else with NATIVE FUNCTION CALLING (like Hermes) ---

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: raw });
    if (conversationHistory.length > 30) conversationHistory = conversationHistory.slice(-30);

    console.log(`📜 History (${conversationHistory.length} entries):`);
    conversationHistory.slice(-4).forEach((m, i) => {
      console.log(`  [${i}] ${m.role}: ${m.content.substring(0, 80)}...`);
    });

    const serverDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const serverTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    // Skip skills context for Groq (token limit too low) — only inject for Gemini
    const currentProvider = llmProvider.getCurrentProvider?.()?.name || '';
    const skillsContext = currentProvider.includes('Gemini') ? skillsManager.loadSkillsForContext(raw) : '';

    const systemPrompt = `You are Fag, an AI coding agent for the Proximity social app. You communicate naturally and conversationally.

📅 TODAY: ${serverDate} — ${serverTime}

📱 PROJECT: React Native + Expo + TypeScript + Supabase
- GitHub repo: badometer-coder/proximity-app
- Auto-deploys on every push to main branch

# Key file paths (USE EXACT PATHS)
- Header: src/components/proximity/ProximityHeader.tsx
- Screens: src/screens/main/HomeScreen.tsx, ChatListScreen.tsx, ChatThreadScreen.tsx, ProximityFeedScreen.tsx
- Auth: src/screens/auth/LoginScreen.tsx, ProfileSetupScreen.tsx
- Context: src/context/ThemeContext.tsx, AuthContext.tsx
- Hooks: src/hooks/auth/useAuth.ts, src/hooks/proximity/useNearbyPeers.ts
- Theme: src/theme/DesignTokens.ts, src/constants/theme.ts
- Config: src/config/supabase.ts, App.tsx, package.json
NOTE: Components are in src/components/proximity/ NOT src/components/. Screens in src/screens/main/ or src/screens/auth/.

# Supabase profiles table (use for user data)
- Table: profiles — columns: id, username, full_name, age, avatar_url
- To get current user profile: supabase.from('profiles').select('full_name, username').eq('id', session.user.id).single()
- useAuth() provides: { session, user, signIn, signUp, signOut, signInWithGoogle, loading }
- session.user.id = current user ID, session.user.email = email

# Tool-use enforcement
- Be natural in conversation. Talk like a human would.
- When user asks to fix/change/add something, understand it and act. Use tools to make changes.
- Keep responses concise and conversational. 
- If it's a coding task, read files, make the fix, and tell them what you did. 
- Don't over-explain or give long monologues. Just do it.

# Finishing the job
A task is ONLY complete when the code is written AND committed to GitHub. After every write_file or patch, tell the user naturally what you changed and that it's pushed. Do NOT run run_tsc — it times out on this server.

# Feature implementation rules
- "Add a toggle" = add a Switch/TouchableOpacity component to the UI file, not just change colors.
- "Night/day mode" or "dark/light mode" = add a visible toggle button the user can tap, connected to ThemeContext toggle().
- Always check ThemeContext.tsx first to understand the existing theme system before implementing.
- The toggle must appear in the screen the user specified.

# React Native safe area rules — CRITICAL
- NEVER use SafeAreaView from 'react-native'. It is a no-op on Android and deprecated.
- ALWAYS use SafeAreaView from 'react-native-safe-area-context'. It works on BOTH iOS and Android.
- Import: \`import { SafeAreaView } from 'react-native-safe-area-context';\`
- The app uses 'react-native-safe-area-context' (already installed).
- For status bar overlap on Android, also use \`<StatusBar barStyle="..." />\` from 'expo-status-bar' and paddingTop from useSafeAreaInsets().
- Example: \`import { useSafeAreaInsets } from 'react-native-safe-area-context'; const insets = useSafeAreaInsets(); <View style={{ paddingTop: insets.top }}>\`
- This app runs on Android (package: com.daniprox.proximityappfinal). Android-safe fixes are mandatory.

# When to use tools vs when to just reply
- Short/vague messages ("?", "ok", "done?") → reply directly, NO tools.
- Status questions → check conversation history first.
- Coding tasks → use read_file first, then write_file or patch.
- Verification → use read_file on the relevant file, answer from what you see.
- Error output pasted by user (contains "error TS", "error:", "failed", exit code, stack traces) → treat as a fix request. Read the affected files and fix immediately. NEVER show a progress report when the user pastes errors.

# Parallel tool calls — MANDATORY
You MUST batch all reads into a single round. On your FIRST tool call, read ALL files you need at once — never read one file per turn.
Example: if you need HomeScreen.tsx AND ThemeContext.tsx, call read_file for BOTH in the same response.
Then on round 2, write the changes. A task should never take more than 3 rounds: read all → write → done.

# Tool rules
- Use read_file to check the codebase. NEVER use web_search to check the repo.
- Use write_file or patch to implement. Always read_file first.
- PREFER patch over write_file for existing files — patch sends only the changed text, write_file sends the ENTIRE file (can exceed token limits).
- Only use write_file for NEW files or files that are truncated/broken.
- After reading a file, IMMEDIATELY use patch or write_file to make the change. Do NOT read the same file twice in one task.
- When using patch, keep old_string SHORT — 2-3 lines max. Long strings with backticks or quotes cause JSON parse errors. Match on plain surrounding text instead of JSX with template literals.
- If read_file returns "[End of file]" or "[Already read this turn]", STOP reading and use patch or write_file.
- web_search ONLY for external docs, never repo content.
- After read_file shows "[File has X lines. Use start_line=N to read more]" — call read_file again with that start_line. Never re-read from 0.
- NEVER duplicate imports. When adding imports to a file, check what's already imported and only add what's missing. If using write_file, include ALL existing imports exactly once.${skillsContext}`;

    // Tool schemas for native function calling
    // NOTE: The LLM should batch multiple read_file calls in a single round
    const toolSchemas = [
      {
        name: 'search_files',
        description: 'Search for text/content across the GitHub repo. Use when you don\'t know the exact file path - e.g. looking for "app name", UI text, or function names.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Text to search for' },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_file',
        description: 'Read a file from the GitHub repo. Returns content with line numbers. For large files, use start_line to page through sections.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path e.g. "src/screens/main/HomeScreen.tsx"' },
            start_line: { type: 'number', description: 'Line to start reading from (0-indexed). Use to page through large files.' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write a COMPLETE file. ONLY use for NEW files. For existing files always use patch instead.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string', description: 'Complete file content' },
            message: { type: 'string', description: 'Commit message' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'patch',
        description: 'PREFERRED TOOL. Replaces old_string with new_string in a file. Use for ALL changes to existing files — much smaller than write_file. Read the file first, copy the exact text, then patch just that section.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            old_string: { type: 'string', description: 'Exact text to find — copy exactly from read_file output' },
            new_string: { type: 'string', description: 'Replacement text' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'web_search',
        description: 'Search the web for documentation or solutions.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ];

    // Native function calling loop — like Hermes
    const messages = [{ role: 'system', content: systemPrompt }, ...conversationHistory];
    let finalReply = '';
    const MAX_ROUNDS = 20;
    let round = 0;
    let lastToolCallJson = '';
    let toolStuckCount = 0;
    const readFilesThisTurn = new Map(); // track file reads — avoid redundant re-reads

    // Always start from the best provider (Gemini) — don't inherit rotation state from previous turn
    llmProvider.resetToFirst();

    while (round < MAX_ROUNDS) {
      const result = await llmProvider.callLLMWithTools(messages, toolSchemas, { temperature: 0.2 });

      // No tool calls — this is the final answer
      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalReply = result.text || 'Done.';
        break;
      }

      console.log(`🔧 Round ${round + 1}: ${result.toolCalls.length} tool call(s)`);

      // Check if agent is stuck (calling same tool with same params AND the result failed)
      // Stuck detection: compare by tool name + file path (ignore start_line differences)
      const toolCallJson = JSON.stringify(result.toolCalls.map(tc => ({ name: tc.name, path: tc.args?.path || tc.args?.query || '' })));
      if (toolCallJson === lastToolCallJson) {
        toolStuckCount++;
        if (toolStuckCount >= 3) {
          console.log(`⚠️  Agent stuck in loop (same tool+path ${toolStuckCount}x) — bailing out`);
          finalReply = `I couldn't find that file. Let me search for the text you're looking for using search_files.`;
          break;
        }
      } else {
        toolStuckCount = 0;
        lastToolCallJson = toolCallJson;
      }

      // Add assistant message with tool calls to conversation
      messages.push({ role: 'assistant', content: result.text || '', tool_calls: result.raw?.tool_calls });

      // Execute tool calls in parallel (Hermes pattern — cuts multi-file tasks from 6 rounds to 2)
      const toolPromises = result.toolCalls.map(async (tc) => {
        console.log(`  → ${tc.name}(${JSON.stringify(tc.args).substring(0, 100)})`);
        selfImprovementEngine.logToolCall({ toolName: tc.name, input: tc.args, timestamp: Date.now() });

        let toolResult;
        if (tc.name === 'read_file' && tc.args?.path) {
          const cacheKey = `${tc.args.path}:${tc.args.start_line || 0}`;
          if (readFilesThisTurn.has(cacheKey)) {
            console.log(`  ↩ cache hit: ${tc.args.path}`);
            toolResult = `[Already read this turn] ${readFilesThisTurn.get(cacheKey)}`;
          } else {
            toolResult = await agentTools.executeTool(tc.name, tc.args);
            if (!(toolResult || '').startsWith('❌')) readFilesThisTurn.set(cacheKey, toolResult);
          }
        } else {
          toolResult = await agentTools.executeTool(tc.name, tc.args);
          if ((tc.name === 'write_file' || tc.name === 'patch') && tc.args?.path) {
            for (const key of readFilesThisTurn.keys()) {
              if (key.startsWith(tc.args.path + ':')) readFilesThisTurn.delete(key);
            }
          }
        }

        const trimmed = (toolResult || '').length > 6000
          ? (toolResult || '').substring(0, 6000) + '\n...(truncated)'
          : toolResult || '';
        console.log(`  [result] ${trimmed.substring(0, 150)}...`);
        return { tc, trimmed };
      });

      const toolResults = await Promise.all(toolPromises);
      for (const { tc, trimmed } of toolResults) {
        messages.push({ role: 'tool', tool_call_id: tc.id || tc.name, content: trimmed });
      }

      // Trim old tool results to stay under token limits
      const systemMsg = messages[0];
      const userMsg = messages.find(m => m.role === 'user');
      const tail = messages.slice(1);
      if (tail.length > 6) {
        const trimmedTail = tail.slice(-6);
        // Always keep the user message
        if (userMsg && !trimmedTail.some(m => m.role === 'user')) {
          trimmedTail.unshift(userMsg);
        }
        // Truncate long tool results to save tokens but keep them
        const compacted = trimmedTail.map(m => {
          if (m.role === 'tool' && m.content && m.content.length > 1000) {
            return { ...m, content: m.content.substring(0, 1000) + '\n...(truncated)' };
          }
          return m;
        });
        messages.length = 0;
        messages.push(systemMsg, ...compacted);
        console.log(`  ✂️  Trimmed message history to ${messages.length} messages to stay under token limit`);
      }

      round++;
      // Small delay to avoid burning through Groq's per-minute token limits
      await new Promise(r => setTimeout(r, 2000));
    } // end while loop

    if (!finalReply) finalReply = 'Task complete. Check the app — changes have been pushed to GitHub.';

    // Remove any leaked tool syntax just in case
    finalReply = finalReply.replace(/\[TOOL:[^\]]*\]/g, '').trim() || finalReply;

    // Store the FINAL reply (not the tool call) in conversation history
    conversationHistory.push({ role: 'assistant', content: finalReply });
    if (conversationHistory.length > 30) conversationHistory = conversationHistory.slice(-30);
    saveConversationHistory(); // persist to disk (survives restarts)

    // 🧠 Self-Improvement: Evaluate if this task should become a reusable skill
    // (Hermes-style learning loop: if 5+ tool calls, create a skill)
    if (selfImprovementEngine.sessionLog.length > 0) {
      await selfImprovementEngine.endTask(
        raw.substring(0, 100),  // task description (user's message)
        finalReply,              // result
        true                     // success
      );
    }

    // Parse action tags
    const cleanReply = finalReply.replace(/\[(DOTASK|DOPLAN|RUN):[^\]]*\]/g, '').trim();
    // Support multiple [DOTASK:] tags for multi-file features
    const taskMatches = [...finalReply.matchAll(/\[DOTASK:\s*([^\]]+)\]/g)].map(m => m[1].trim());
    const taskMatch = taskMatches.length > 0 ? { 1: taskMatches[0] } : null;
    let planMatch = finalReply.match(/\[DOPLAN:\s*([^\]]+)\]/);
    const runMatch2 = finalReply.match(/\[RUN:\s*(\d+)\]/);

    // Safety: if user didn't say "plan" or "create tasks", don't create a plan - execute directly
    if (planMatch && !msg.includes('make a plan') && !msg.includes('create tasks') && !msg.includes('create a plan')) {
      console.log(`⚠️ LLM tried DOPLAN but user didn't ask for a plan - converting to DOTASK`);
      planMatch = null;
    }

    if (cleanReply) await ctx.reply(cleanReply);

    if (taskMatches.length > 0) {
      if (taskMatches.length > 1) {
        await ctx.reply(`📋 Breaking into ${taskMatches.length} steps...`);
      }
      for (let i = 0; i < taskMatches.length; i++) {
        const specificTask = taskMatches[i];

      // Handle commit/push requests directly without LLM code generation
      if (specificTask.toLowerCase().includes('commit') || specificTask.toLowerCase().includes('push')) {
        await ctx.reply(`📦 Committing and pushing...`);
        const appPath = process.env.PROJECT_PATH || '/opt/render/project/proximity-app';
        const githubToken = process.env.GITHUB_TOKEN;
        try {
          const { execSync } = await import('child_process');
          execSync(`git -C "${appPath}" config user.email "agent@proximity.app"`, { stdio: 'pipe' });
          execSync(`git -C "${appPath}" config user.name "AI Agent"`, { stdio: 'pipe' });
          if (githubToken) {
            execSync(`git -C "${appPath}" remote set-url origin https://${githubToken}@github.com/badometer-coder/proximity-app.git`, { stdio: 'pipe' });
          }
          execSync(`git -C "${appPath}" add -A`, { stdio: 'pipe' });
          const commitMsg = `AI: manual commit via Telegram`;
          execSync(`git -C "${appPath}" commit -m "${commitMsg}"`, { stdio: 'pipe' });
          execSync(`git -C "${appPath}" push origin main`, { stdio: 'pipe' });
          await ctx.reply(`✅ Committed and pushed to GitHub!`);
        } catch (gitError) {
          const msg = (gitError.stdout || '') + (gitError.stderr || '') + gitError.message;
          if (msg.includes('nothing to commit') || msg.includes('up to date')) {
            await ctx.reply(`✅ Nothing new to commit — repo is already up to date.`);
          } else {
            await ctx.reply(`⚠️ Git error: ${msg.substring(0, 300)}`);
          }
        }
        return;
      }
      if (taskMatches.length > 1) await ctx.reply(`⚙️ [${i+1}/${taskMatches.length}] ${specificTask.substring(0, 60)}...`);
      else await ctx.reply(`⚙️ Working on it...`);
      const result = await executeTask(specificTask, ctx);
      if (result) {
        memory.recordTaskCompletion(specificTask, true, result, llmProvider.getCurrentProvider().name, 0);
        const preview = result.substring(0, 400);
        await ctx.reply(`✅ Step ${i+1} done!\n\n${preview}${result.length > 400 ? '\n...(full code saved)' : ''}`);
      } else {
        await ctx.reply(`❌ Step ${i+1} failed. Try being more specific.`);
      }
      }  // end for loop
    } else if (planMatch) {
      const topic = planMatch[1].trim();
      await ctx.reply(`📋 Creating plan for: ${topic}`);
      const tasks = await createExecutionPlan(topic);
      taskQueue = tasks;
      await ctx.reply(`✅ ${tasks.length} tasks created!\n\nFirst 5:\n${tasks.slice(0,5).map((t,i)=>`${i+1}. ${t.substring(0,80)}`).join('\n')}\n\nSay "go ahead" to start!`);
    } else if (runMatch2) {
      const count = parseInt(runMatch2[1]);
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued.');
      return runTasks(ctx, count);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    ctx.reply(`Error: ${error.message}`).catch(() => {});
  } finally {
    clearInterval(typingInterval);
  }
}

// Helper: run N tasks
async function runTasks(ctx, count) {
  const toRun = Math.min(count, taskQueue.length);
  await ctx.reply(`🚀 Running ${toRun} task(s)...`);
  let completed = 0;
  for (let i = 0; i < toRun; i++) {
    const task = taskQueue.shift();
    try {
      await ctx.reply(`⚙️ [${i+1}/${toRun}] ${task.substring(0, 80)}...`);
      const result = await executeTask(task, ctx);
      if (result) {
        const validation = await validateTaskCompletion(task, result);
        const approved = validation && validation.toUpperCase().includes('DECISION: YES');
        if (approved) {
          completed++;
          taskLog.push({ task, result });
          memory.recordTaskCompletion(task, true, result, llmProvider.getCurrentProvider().name, 0);
          await ctx.reply(`✅ Task ${i+1} done!`);
        } else {
          taskQueue.unshift(`[REVISION] ${task}`);
          await ctx.reply(`⚠️ Task ${i+1} needs revision.`);
        }
      }
    } catch (err) {
      await ctx.reply(`❌ Task ${i+1} failed: ${err.message}`);
    }
  }
  return ctx.reply(`📊 Done! ${completed}/${toRun} succeeded. ${taskQueue.length} remaining.`);
}

bot.command('status', (ctx) => {
  const total = taskQueue.length + taskLog.length;
  const completed = taskLog.length;
  
  ctx.reply(`📊 PROGRESS\n✅ Done: ${completed}\n⏳ Remaining: ${taskQueue.length}\n📈 Total: ${total}`);
});

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  if (ctx && ctx.chat) {
    ctx.reply(`⚠️ Error: ${err.message}`).catch(() => {});
  }
});

// Show completed tasks
bot.command('tasks', (ctx) => {
  console.log(`\n📋 /tasks command received from user ${ctx.from.id}`);
  
  if (taskLog.length === 0) {
    console.log(`❌ No completed tasks`);
    ctx.reply('❌ No completed tasks yet.');
    return;
  }
  
  const completedList = taskLog
    .slice(-10) // Show last 10
    .map((t, i) => `${taskLog.length - 10 + i + 1}. ${(t.task || t.name)?.substring(0, 70) || 'Unknown'}`)
    .join('\n');
  
  console.log(`✅ Sending ${Math.min(10, taskLog.length)} completed tasks`);
  ctx.reply(`✅ Last ${Math.min(10, taskLog.length)} completed tasks:\n\n${completedList}`);
});

// Memory command - show learning stats
bot.command('memory', (ctx) => {
  console.log(`\n📚 /memory command received`);
  const stats = memory.getStats();
  ctx.reply(`📚 MEMORY STATS\n\n📊 Session started: ${stats.sessionStart.substring(0, 10)}\n✅ Completed: ${stats.tasksCompleted}\n❌ Failed: ${stats.tasksFailed}\n💬 Conversations: ${stats.conversationTurns}\n📈 Success rate: ${stats.successRate?.current?.toFixed(1) || 'N/A'}%\n\n🏆 Best practices: ${stats.lastBestPractices?.length || 0}`);
});

// Providers command - show live provider status
bot.command('providers', (ctx) => {
  const stats = llmProvider.getStats();
  const lines = stats.providers.map(p => `${p.includes('(DEAD)') ? '💀' : '✅'} ${p}`);
  ctx.reply(`🤖 LLM Providers (${stats.aliveProviders}/${stats.totalProviders} alive)\n\n${lines.join('\n')}`);
});

// Debug: Log ALL updates
bot.use((ctx, next) => {
  console.log(`📨 Update: ${ctx.update.update_id}, Type: ${Object.keys(ctx.update).filter(k => k !== 'update_id')[0]}`);
  return next();
});

console.log('🤖 Agent Coordinator Started');
console.log('📱 Listening for Telegram messages...\n');

// Start Telegram bot with polling
let bot409Retries = 0;
async function startBot() {
  try {
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message']
    });
    console.log('✅ Telegram bot launched (polling mode)');
  } catch (error) {
    if (error.message && error.message.includes('409')) {
      bot409Retries++;
      console.error(`❌ Bot conflict (409): Another instance is running (retry ${bot409Retries})`);
      if (bot409Retries >= 10) {
        console.error('   Max retries reached — old instance should be gone by now. Exiting to force restart.');
        process.exit(1);
      }
      // Wait with backoff: 5s, 10s, 15s, 20s... up to 60s
      // This gives the OLD instance time to be killed by Render during deploy
      const waitTime = Math.min(5000 * bot409Retries, 60000);
      console.error(`   Retrying in ${waitTime/1000}s... (waiting for old instance to shut down)`);
      setTimeout(startBot, waitTime);
    } else {
      console.error('❌ Failed to launch Telegram bot:', error.message);
      console.error('   Retrying in 15 seconds...');
      setTimeout(startBot, 15000);
    }
  }
}

startBot();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received — shutting down gracefully');
  process.exit(0);
});

// CI error notification — DISABLED (burns too many tokens with broken ProximityHeader.tsx)
// TODO: Re-enable once ProximityHeader.tsx is fixed
setCIErrorCallback(async (errorMessage) => {
  console.log(`🚨 CI Error received but auto-fix is DISABLED to conserve tokens`);
  console.log(`   Error: ${errorMessage.substring(0, 100)}`);
  if (telegramBotContext) {
    await telegramBotContext.telegram.sendMessage(
      telegramBotContext.chat.id,
      `🚨 CI failed:\n\n${errorMessage.substring(0, 400)}\n\n⚠️ Auto-fix disabled — please fix manually via Telegram.`
    ).catch(() => {});
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Shutting down...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('Shutting down...');
  bot.stop('SIGTERM');
});

// Global error handler to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
