# Agent Swarm - Proximity App Development

This folder contains the autonomous agent swarm for developing the Proximity Social App.

## Agents

### 1. **Project Manager** (`project-manager.js`)
- Maintains the full development roadmap
- Tracks completed tasks and progress
- Recommends next priorities
- Coordinates workflow between agents

**Commands:**
- `/plan` - View full development plan
- `/next` - Get next recommended task
- `/status` - Show project status
- `/complete <task>` - Mark task as done

### 2. **Dev Agent** (`dev-agent.js`)
- Analyzes codebase
- Generates code based on tasks
- Tests implementation
- Commits changes to Git

**Commands:**
- `/task <description>` - Start development task
- `/status` - Check agent status
- `/help` - Show help

## Setup

1. **Install dependencies** (in parent folder):
   ```bash
   cd ..
   npm install
   ```

2. **Configure `.env`**:
   ```
   GROQ_API_KEY=your_key
   TELEGRAM_BOT_TOKEN=your_token
   GIT_USER_NAME=owner
   GIT_USER_EMAIL=owner@localhost
   PROJECT_PATH=/Users/owner/proximity-app-final
   ```

3. **Run agents**:
   ```bash
   # Terminal 1 - Project Manager
   node swarm/project-manager.js
   
   # Terminal 2 - Dev Agent
   node swarm/dev-agent.js
   ```

## Workflow

1. **Start with PM**: `/plan` to see full roadmap
2. **Get recommendation**: `/next` to see priority task
3. **Assign to Dev**: `/task implement xyz`
4. **Track progress**: `/status` in both agents
5. **Mark complete**: `/complete xyz` in PM
6. **Repeat**: `/next` for new task

## Architecture

```
Telegram
    ↓
Project Manager (Coordinator)
    ├── Knows full plan
    ├── Prioritizes tasks
    └── Tracks progress
        ↓
    Dev Agent (Executor)
        ├── Reads codebase
        ├── Generates code
        ├── Tests changes
        └── Commits to Git
```

## Project: Proximity Social App

- **Tech**: React Native + Expo SDK 54, TypeScript, Supabase (PostgreSQL + PostGIS)
- **Status**: Phase 1 (Foundation) - In Progress
- **Next Priority**: Live distance updates, message syncing, user blocking

See `project-manager.js` for full roadmap.
