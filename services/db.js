// services/db.js
// Local SQLite + Supabase sync (Expo SDK 50+ compatible)

import * as SQLite from 'expo-sqlite';
import { supabase } from '../services/supabase';

// ✅ Correct new way to open database in Expo SDK 50+
const db = SQLite.openDatabaseSync
  ? SQLite.openDatabaseSync('offline.db') // New API (Expo SDK 50+)
  : SQLite.openDatabase('offline.db');    // Fallback for older versions

// --- Create local tables ---
(async () => {
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vocab_learned_local (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER,
        learned_at TEXT
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS lesson_progress_local (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chapter_no INTEGER,
        lesson_no INTEGER,
        completed INTEGER,
        updated_at TEXT
      );
    `);
  } catch (err) {
    console.error('DB init error:', err);
  }
})();

// --- Save vocab progress locally ---
export async function saveWordLocally(word_id) {
  try {
    const timestamp = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO vocab_learned_local (word_id, learned_at) VALUES (?, ?)`,
      [word_id, timestamp]
    );
  } catch (err) {
    console.error('Save word error:', err);
  }
}

// --- Sync local data with Supabase ---
export async function syncWithSupabase(user_id) {
  try {
    // 1. Sync vocab
    const vocabRows = await db.getAllAsync(`SELECT * FROM vocab_learned_local`);
    for (const item of vocabRows) {
      await supabase.from('vocab_learned').upsert({
        user_id,
        word_id: item.word_id,
        learned_at: item.learned_at,
      });
    }

    // 2. Sync lessons
    const lessonRows = await db.getAllAsync(`SELECT * FROM lesson_progress_local`);
    for (const item of lessonRows) {
      await supabase.from('lesson_progress').upsert(
        {
          user_id,
          chapter_no: item.chapter_no,
          lesson_no: item.lesson_no,
          completed: !!item.completed,
          updated_at: item.updated_at,
        },
        { onConflict: ['user_id', 'chapter_no', 'lesson_no'] }
      );
    }

    console.log('✅ Local data synced to Supabase.');
  } catch (err) {
    console.error('❌ Sync error:', err);
  }
}

export { db };
