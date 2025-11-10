import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://udflaxxwipwtifeazdfl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkZmxheHh3aXB3dGlmZWF6ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NDE3ODAsImV4cCI6MjA3MjAxNzc4MH0.7rhhVlqNZrIOlFd8AHX2O4Xo1CztJ-BSTRrd97Y1vaU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN doesn’t use URL
  },
})
