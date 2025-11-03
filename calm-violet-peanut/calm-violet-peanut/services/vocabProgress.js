// services/vocabProgress.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase'; // adjust path if your supabase client is elsewhere

const VOCAB_LEARNED_COUNT = 'VOCAB_LEARNED_COUNT.v1';
const VOCAB_LEARNED_LIST = 'VOCAB_LEARNED_LIST.v1';
const VOCAB_UPSERT_QUEUE = 'VOCAB_UPSERT_QUEUE.v1';
const BATCH_SIZE = 200; // safe batched sizes

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * markLessonVocabsLearned
 * - finds all unique vocabs for a lesson
 * - ensures vocab table has entries (upsert)
 * - upserts user_vocab rows in batch
 * - updates local AsyncStorage cache (count + learned list)
 *
 * lessonKey: string (e.g. "3" or "12_4") — used as source_lesson_key
 * opts: { offlineQueue: true } - if Supabase upsert fails, push to local queue
 */
export async function markLessonVocabsLearned(lessonKey, opts = { offlineQueue: true }) {
  try {
    const userId = await getUserId();
    if (!userId) {
      console.warn('markLessonVocabsLearned: no user');
      return;
    }

    // 1) fetch lesson vocabs
    // lessonKey may be composite -> parse it (we assume lessonKey matches your lesson storage)
    // we will try matching by lesson_no and (optionally) chapter_no if lessonKey contains '_'
    let chapter = null;
    let lesson = null;
    if (lessonKey && lessonKey.includes('_')) {
      const parts = lessonKey.split('_');
      chapter = Number(parts[0]);
      lesson = Number(parts[1]);
    } else {
      lesson = Number(lessonKey);
    }

    // build query filter
    let query = supabase.from('lesson_vocab').select('vocab, vocab_pinyin, vocab_translation').neq('vocab', null);
    if (chapter != null) {
      query = query.eq('chapter_no', chapter).eq('lesson_no', lesson);
    } else {
      query = query.eq('lesson_no', lesson);
    }

    const { data: lessonVocabs, error: lessonVocabsErr } = await query;
    if (lessonVocabsErr) throw lessonVocabsErr;
    if (!lessonVocabs || lessonVocabs.length === 0) {
      // nothing to do
      return;
    }

    // dedupe by vocab text (trim)
    const uniqMap = {};
    for (const r of lessonVocabs) {
      const key = (r.vocab || '').toString().trim();
      if (!key) continue;
      if (!uniqMap[key]) uniqMap[key] = { vocab: key, pinyin: r.vocab_pinyin || null, translation: r.vocab_translation || null };
    }
    const uniqVocabs = Object.values(uniqMap);
    if (uniqVocabs.length === 0) return;

    // 2) ensure vocab table has entries for these vocabs (batched upsert)
    // upsert into vocab: on conflict do update for pinyin/translation if null
    // Supabase JS client doesn't support "on conflict update only when null" easily; we'll perform naïve upsert
    // Map to rows: { vocab, pinyin, translation }
    for (let i = 0; i < uniqVocabs.length; i += BATCH_SIZE) {
      const batch = uniqVocabs.slice(i, i + BATCH_SIZE);
      const { error: upsertVocabErr } = await supabase.from('vocab').upsert(batch, { onConflict: ['vocab'] });
      if (upsertVocabErr) console.warn('vocab upsert error (non-fatal):', upsertVocabErr.message ?? upsertVocabErr);
    }

    // 3) fetch ids for these vocabs from vocab table
    const vocabTexts = uniqVocabs.map((v) => v.vocab);
    const { data: vocabRows, error: fetchVocabRowsErr } = await supabase.from('vocab').select('id, vocab, pinyin, translation').in('vocab', vocabTexts);
    if (fetchVocabRowsErr) throw fetchVocabRowsErr;
    const vocabByText = {};
    (vocabRows || []).forEach((r) => {
      vocabByText[(r.vocab || '').toString().trim()] = r;
    });

    // 4) build user_vocab upsert rows
    const learnedAt = new Date().toISOString();
    const userVocabRows = [];
    uniqVocabs.forEach((v) => {
      const row = vocabByText[v.vocab];
      if (!row || !row.id) {
        // should not happen, but guard
        return;
      }
      userVocabRows.push({
        user_id: userId,
        vocab_id: row.id,
        learned_at: learnedAt,
        source_lesson_key: String(lessonKey),
      });
    });

    if (userVocabRows.length === 0) return;

    // 5) batched upsert user_vocab
    try {
      for (let i = 0; i < userVocabRows.length; i += BATCH_SIZE) {
        const batch = userVocabRows.slice(i, i + BATCH_SIZE);
        // upsert on (user_id, vocab_id)
        const { error: upsertUserVocabErr } = await supabase.from('user_vocab').upsert(batch, { onConflict: ['user_id', 'vocab_id'] });
        if (upsertUserVocabErr) throw upsertUserVocabErr;
      }
    } catch (err) {
      // network/offline: queue for later if allowed
      console.warn('user_vocab upsert failed, queuing locally:', err?.message ?? err);
      if (opts.offlineQueue) {
        await enqueuePendingUpsert(userVocabRows);
      }
      // still continue to update local cache (optimistic)
    }

    // 6) update local AsyncStorage: VOCAB_LEARNED_LIST and VOCAB_LEARNED_COUNT
    await updateLocalLearnedCache(userId);

    return true;
  } catch (err) {
    console.warn('markLessonVocabsLearned error:', err?.message ?? err);
    // On error, schedule queue if appropriate
    return false;
  }
}

/** enqueuePendingUpsert: push user_vocab rows into VOCAB_UPSERT_QUEUE */
async function enqueuePendingUpsert(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(VOCAB_UPSERT_QUEUE);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ rows, created_at: new Date().toISOString() });
    await AsyncStorage.setItem(VOCAB_UPSERT_QUEUE, JSON.stringify(queue));
  } catch (err) {
    console.warn('enqueuePendingUpsert failed:', err?.message ?? err);
  }
}

/** syncPendingVocabUpserts: attempt to flush local queue to Supabase */
export async function syncPendingVocabUpserts() {
  try {
    const userId = await getUserId();
    if (!userId) return;
    const raw = await AsyncStorage.getItem(VOCAB_UPSERT_QUEUE);
    const queue = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(queue) || queue.length === 0) return;

    const remaining = [];
    for (const item of queue) {
      const rows = item.rows || [];
      // send in batches (respect BATCH_SIZE)
      let failed = false;
      try {
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('user_vocab').upsert(batch, { onConflict: ['user_id', 'vocab_id'] });
          if (error) {
            failed = true;
            console.warn('sync batch failed:', error.message ?? error);
            break;
          }
        }
      } catch (err) {
        failed = true;
        console.warn('syncPendingVocabUpserts batch threw', err?.message ?? err);
      }
      if (failed) {
        remaining.push(item); // keep for retry
      } else {
        // success: update local learned cache
        await updateLocalLearnedCache(userId);
      }
    }

    // write back remaining
    await AsyncStorage.setItem(VOCAB_UPSERT_QUEUE, JSON.stringify(remaining));
  } catch (err) {
    console.warn('syncPendingVocabUpserts error:', err?.message ?? err);
  }
}

/** updateLocalLearnedCache
 * fetches current unique learned vocabs for the user from Supabase and caches:
 *  - VOCAB_LEARNED_COUNT (integer)
 *  - VOCAB_LEARNED_LIST (array of {vocab, pinyin, translation, learned_at, source_lesson_key})
 */
export async function updateLocalLearnedCache(userIdParam = null) {
  try {
    const userId = userIdParam || (await getUserId());
    if (!userId) return;

    // fetch unique learned vocab rows with join to vocab table
    // We want one row per (user_id, vocab_id)
    const { data: learnedRows, error } = await supabase
      .from('user_vocab')
      .select(`vocab_id, learned_at, source_lesson_key, vocab: vocab(id, vocab, pinyin, translation)`)
      .eq('user_id', userId);

    if (error) throw error;

    const list = (learnedRows || []).map((r) => {
      const v = r.vocab || {};
      return {
        vocab_id: r.vocab_id,
        vocab: v.vocab || '',
        pinyin: v.pinyin || '',
        translation: v.translation || '',
        learned_at: r.learned_at,
        source_lesson_key: r.source_lesson_key,
      };
    });

    // dedupe by vocab text just in case and compute unique count
    const byVocab = {};
    for (const item of list) {
      const key = (item.vocab || '').toString().trim();
      if (!key) continue;
      if (!byVocab[key]) byVocab[key] = item;
    }
    const deduped = Object.values(byVocab);

    await AsyncStorage.setItem(VOCAB_LEARNED_LIST, JSON.stringify(deduped));
    await AsyncStorage.setItem(VOCAB_LEARNED_COUNT, String(deduped.length));
    return { count: deduped.length, list: deduped };
  } catch (err) {
    console.warn('updateLocalLearnedCache error:', err?.message ?? err);
    return null;
  }
}

/** getLocalLearnedCount() -> number */
export async function getLocalLearnedCount() {
  try {
    const raw = await AsyncStorage.getItem(VOCAB_LEARNED_COUNT);
    return raw ? Number(raw) || 0 : 0;
  } catch (err) {
    return 0;
  }
}

/** getLocalLearnedList() -> array */
export async function getLocalLearnedList() {
  try {
    const raw = await AsyncStorage.getItem(VOCAB_LEARNED_LIST);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

export default {
  markLessonVocabsLearned,
  syncPendingVocabUpserts,
  updateLocalLearnedCache,
  getLocalLearnedCount,
  getLocalLearnedList,
};
