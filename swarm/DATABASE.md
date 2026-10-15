# Database Access for Agents

The agents now have direct access to your Supabase database!

## Setup

1. **Get your Supabase credentials:**
   - Go to https://supabase.com
   - Select your project
   - Go to Settings → API
   - Copy:
     - Project URL
     - Anon Key
     - Service Role Key (admin key)

2. **Add to `.env`:**
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_anon_key_here
   SUPABASE_ADMIN_KEY=your_service_role_key_here
   ```

3. **That's it!** Agents can now query the database.

## Agent Database Commands

### Dev Agent

```
/db schema       - List all database tables
/db test-accounts - Show test user accounts
/db stats        - Get database statistics
```

### What Agents Can Do

- Query the database schema
- Access test credentials
- Check database stats
- Get nearby peers
- Query chat history
- Execute RPC functions
- Answer questions about the database

## Available Functions

### In `db-utils.js`:

```javascript
// Get database structure
getDatabaseSchema()

// Get test user accounts
getTestAccounts()

// Get statistics
getDatabaseStats()

// Execute stored procedures
executeRPC(functionName, params)

// Get nearby peers
getNearbyPeers(lat, lon, radiusKm)

// Get chat history
getChatHistory(userId1, userId2)

// Query any table
queryTable(tableName, filters)
```

## Security Notes

- ⚠️ **ADMIN KEY**: The agents use the admin key for full database access. Keep this private!
- ✅ Only share the Anon Key publicly
- 🔒 The agents use the admin key to make schema queries and access restricted data
- 🛡️ Never commit `.env` to version control

## Example Workflow

1. **Ask for test account info:**
   ```
   /ask what are the test login credentials?
   ```
   Agent queries database and answers!

2. **Check if database is connected:**
   ```
   /db stats
   ```

3. **Verify your project structure:**
   ```
   /db schema
   ```

That's it! Your agents now have database intelligence. 🚀
