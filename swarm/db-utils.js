import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client with admin privileges
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ADMIN_KEY || process.env.SUPABASE_KEY
);

// Get database schema information
export async function getDatabaseSchema() {
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting schema:', error.message);
    return [];
  }
}

// Get test users/credentials
export async function getTestAccounts() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username')
      .limit(10);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting test accounts:', error.message);
    return [];
  }
}

// Get database statistics
export async function getDatabaseStats() {
  try {
    const { data: profiles, error: e1 } = await supabase
      .from('profiles')
      .select('count()', { count: 'exact' });
    
    const { data: messages, error: e2 } = await supabase
      .from('messages')
      .select('count()', { count: 'exact' });
    
    if (e1 || e2) throw new Error('Failed to get stats');
    
    return {
      profiles: profiles?.length || 0,
      messages: messages?.length || 0,
    };
  } catch (error) {
    console.error('Error getting stats:', error.message);
    return null;
  }
}

// Execute RPC function
export async function executeRPC(functionName, params) {
  try {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error executing RPC ${functionName}:`, error.message);
    return null;
  }
}

// Get nearby peers (testing)
export async function getNearbyPeers(latitude, longitude, radiusKm) {
  try {
    const result = await executeRPC('get_nearby_peers', {
      user_lat: latitude,
      user_lon: longitude,
      radius_km: radiusKm,
    });
    return result;
  } catch (error) {
    console.error('Error getting nearby peers:', error.message);
    return null;
  }
}

// Get chat history
export async function getChatHistory(userId1, userId2) {
  try {
    const result = await executeRPC('get_chat_history', {
      user_id_1: userId1,
      user_id_2: userId2,
    });
    return result;
  } catch (error) {
    console.error('Error getting chat history:', error.message);
    return null;
  }
}

// Query any table
export async function queryTable(tableName, filters = {}) {
  try {
    let query = supabase.from(tableName).select('*');
    
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    
    const { data, error } = await query.limit(10);
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error querying ${tableName}:`, error.message);
    return null;
  }
}

export default {
  supabase,
  getDatabaseSchema,
  getTestAccounts,
  getDatabaseStats,
  executeRPC,
  getNearbyPeers,
  getChatHistory,
  queryTable,
};
