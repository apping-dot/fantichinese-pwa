import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../services/supabase';

const DOWNLOADED_KEY = 'downloaded.lessons.v1';
const COMPLETED_KEY = 'lesson.completed.v1';
const LESSONS_CACHE_KEY = 'lesson_meta.cache.v1';
const LESSON_JSON_PREFIX = 'lesson.json.v1.'; // old prefix (kept for compatibility)
const LESSON_CACHE_PREFIX = 'lesson.cache.v1.'; // WHAT LessonScreen uses for cached rows (important)
const LESSON_QUESTIONS_PREFIX = 'lesson_questions_';

const PREMIUM_CHAPTER_START = 2; // Chapter 2 onwards is premium
const MONTHLY_PRICE_ID = 'price_xxx_monthly'; // Replace with your Stripe price ID
const YEARLY_PRICE_ID = 'price_xxx_yearly';

export default function LessonListScreen({ navigation, route }) {
  const chapter_no = route?.params?.chapter_no ?? null;

  const [sections, setSections] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [completedMap, setCompletedMap] = useState({});
  const [downloadedMap, setDownloadedMap] = useState({});
  const [downloadingMap, setDownloadingMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedCache, setHasLoadedCache] = useState(false);
  const [userHasSubscription, setUserHasSubscription] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  useEffect(() => {
    loadCachedLessons().finally(() => {
      loadCompleted();
      loadDownloaded();
      loadLessonsOrSections();
    });

    checkUserSubscription(); // Check subscription on mount

    const unsubscribe = navigation.addListener('focus', () => {
      loadCachedLessons().finally(() => {
        loadCompleted();
        loadDownloaded();
        loadLessonsOrSections();
      });
      checkUserSubscription();
    });
    return unsubscribe;
  }, [navigation, chapter_no]);

  // --------------------- CACHE & FETCH ---------------------
  async function loadCachedLessons() {
    try {
      const raw = await AsyncStorage.getItem(LESSONS_CACHE_KEY);
      if (!raw) {
        setHasLoadedCache(false);
        return;
      }
      const data = JSON.parse(raw) || [];
      if (chapter_no) {
        const filtered = data.filter((r) => Number(r.chapter_no) === Number(chapter_no));
        setLessons(filtered);
        setSections([]);
      } else {
        const grouped = data.reduce((acc, row) => {
          const chapter = row.chapter_title || `Chapter ${row.chapter_no}`;
          if (!acc[chapter]) acc[chapter] = [];
          acc[chapter].push(row);
          return acc;
        }, {});
        const sectionsData = Object.keys(grouped).map((chapter) => ({
          title: chapter,
          data: grouped[chapter],
        }));
        setSections(sectionsData);
        setLessons([]);
      }
      setHasLoadedCache(true);
      setLoading(false);
    } catch (err) {
      console.warn('Load lessons cache failed:', err?.message ?? err);
    }
  }

  async function loadLessonsOrSections() {
    if (!hasLoadedCache) setLoading(true);

    try {
      if (chapter_no) {
        const { data, error } = await supabase
          .from('lesson_meta')
          .select('*')
          .eq('chapter_no', Number(chapter_no))
          .order('lesson_no', { ascending: true });

        if (error) throw error;

        setLessons(data || []);
        setSections([]);
        await updateLessonsCacheWithFetched(data || [], chapter_no);
      } else {
        const { data, error } = await supabase
          .from('lesson_meta')
          .select('*')
          .order('chapter_no', { ascending: true })
          .order('lesson_no', { ascending: true });

        if (error) throw error;

        const grouped = data.reduce((acc, row) => {
          const chapter = row.chapter_title || `Chapter ${row.chapter_no}`;
          if (!acc[chapter]) acc[chapter] = [];
          acc[chapter].push(row);
          return acc;
        }, {});

        const sectionsData = Object.keys(grouped).map((chapter) => ({
          title: chapter,
          data: grouped[chapter],
        }));
        setSections(sectionsData);
        setLessons([]);
        await AsyncStorage.setItem(LESSONS_CACHE_KEY, JSON.stringify(data || []));
      }
    } catch (e) {
      console.warn('Load lessons failed:', e?.message ?? e);
      Alert.alert('Failed to load lessons', String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function updateLessonsCacheWithFetched(fetched = [], chapterNo) {
    try {
      const raw = await AsyncStorage.getItem(LESSONS_CACHE_KEY);
      let cache = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(cache)) cache = [];

      const remaining = cache.filter((r) => Number(r.chapter_no) !== Number(chapterNo));
      const merged = [...remaining, ...(fetched || [])];
      await AsyncStorage.setItem(LESSONS_CACHE_KEY, JSON.stringify(merged));
    } catch (err) {
      console.warn('Update lessons cache failed:', err?.message ?? err);
    }
  }

  async function loadCompleted() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('lesson_progress')
          .select('lesson_id, completed')
          .eq('user_id', user.id);

        if (data && !error) {
          const map = {};
          data.forEach((row) => {
            map[String(row.lesson_id)] = !!row.completed;
          });
          setCompletedMap(map);
          await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
          return;
        }
      }
      const saved = await AsyncStorage.getItem(COMPLETED_KEY);
      if (saved) setCompletedMap(JSON.parse(saved));
    } catch (err) {
      console.warn('Load completed failed:', err?.message ?? err);
    }
  }

  async function loadDownloaded() {
    try {
      const saved = await AsyncStorage.getItem(DOWNLOADED_KEY);
      if (!saved) return;

      // saved may contain keys in legacy/composite form. We'll keep as-is but store into state.
      // renderLessonCard will check both legacy and canonical numeric keys.
      const parsed = JSON.parse(saved);
      setDownloadedMap(parsed || {});
    } catch (err) {
      console.warn('Load downloaded failed:', err?.message ?? err);
    }
  }

  // --------------------- CHECK SUBSCRIPTION ---------------------
  async function checkUserSubscription() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setUserHasSubscription(false);

      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);

      setUserHasSubscription(Array.isArray(data) && data.length > 0);
    } catch (err) {
      console.warn('Check subscription failed:', err);
      setUserHasSubscription(false);
    }
  }

  // --------------------- HELPERS ---------------------
  // compute packed numeric lesson id using your chosen format:
  // '1' + lpad(chapter_no,2,'0') + lpad(lesson_no,3,'0') e.g. chapter 1 lesson 3 => 101003
  function computePackedLessonId(chapterNo, lessonNo) {
    try {
      const ch = Number(chapterNo || 0);
      const le = Number(lessonNo || 0);
      const chStr = String(ch).padStart(2, '0'); // 2 digits
      const leStr = String(le).padStart(3, '0'); // 3 digits
      return Number(`1${chStr}${leStr}`);
    } catch (e) {
      return null;
    }
  }

  // --------------------- DOWNLOAD LESSON ---------------------
  async function downloadLessonJSON(lesson) {
    // Prefer numeric lesson_id if present; otherwise compute packed id
    const canonicalId = lesson.lesson_id ? String(lesson.lesson_id) : String(computePackedLessonId(lesson.chapter_no, lesson.lesson_no));
    const jsonKey = `${LESSON_JSON_PREFIX}${canonicalId}`;
    const cacheKey = `${LESSON_CACHE_PREFIX}${canonicalId}`; // rows array used by LessonScreen
    const questionsKey = `${LESSON_QUESTIONS_PREFIX}${canonicalId}`;

    // we will still generate legacy composite for backwards compatibility marker,
    // but store the canonical numeric key so LessonScreen can read it.
    const legacyKey = `${lesson.chapter_no}_${lesson.lesson_no}`;

    setDownloadingMap((p) => ({ ...p, [canonicalId]: true, [legacyKey]: true }));

    try {
      // 1) fetch lesson lines (rows)
      const { data: lines, error: linesError } = await supabase
        .from('lessons')
        .select('speaker, chinese, pinyin, translation, page, lesson_title, chapter_title, id, chapter_no, lesson_no')
        .eq('chapter_no', lesson.chapter_no)
        .eq('lesson_no', lesson.lesson_no)
        .order('id', { ascending: true });
      if (linesError) throw linesError;

      // 2) fetch questions
      const { data: questions, error: qError } = await supabase
        .from('lesson_questions')
        .select('page, question_text, normal_audio_url')
        .eq('chapter_no', lesson.chapter_no)
        .eq('lesson_no', lesson.lesson_no)
        .order('page', { ascending: true });
      if (qError) throw qError;

      // 3) fetch vocab
      const { data: vocab, error: vocabError } = await supabase
        .from('lesson_vocab')
        .select('vocab, vocab_pinyin, vocab_translation')
        .eq('chapter_no', lesson.chapter_no)
        .eq('lesson_no', lesson.lesson_no)
        .order('id', { ascending: true });
      if (vocabError) throw vocabError;

      const lessonData = { chapter_no: lesson.chapter_no, lesson_no: lesson.lesson_no, lines, questions, vocab };

      // Save the canonical per-row cache that LessonScreen expects
      await AsyncStorage.setItem(cacheKey, JSON.stringify(lines || []));
      // Save questions under canonical key that LessonScreen reads
      await AsyncStorage.setItem(questionsKey, JSON.stringify(questions || []));
      // Save combined JSON as well (compatibility)
      await AsyncStorage.setItem(jsonKey, JSON.stringify(lessonData || {}));

      // Mark downloaded map using canonical id (so LessonScreen can find it)
      const newMap = { ...downloadedMap, [canonicalId]: true, [legacyKey]: true };
      setDownloadedMap(newMap);
      await AsyncStorage.setItem(DOWNLOADED_KEY, JSON.stringify(newMap));

      Alert.alert('成功', `Lesson ${lesson.lesson_no} 已下載`);
    } catch (err) {
      console.warn('Download failed', err);
      Alert.alert('下載失敗', '無法下載此課程');
    } finally {
      setDownloadingMap((p) => {
        const copy = { ...p };
        delete copy[String(lesson.chapter_no + '_' + lesson.lesson_no)];
        delete copy[String(lesson.lesson_id ?? computePackedLessonId(lesson.chapter_no, lesson.lesson_no))];
        return copy;
      });
    }
  }

  async function handleDownload(lesson) {
    downloadLessonJSON(lesson);
  }

  // --------------------- SUBSCRIPTION CHECK ---------------------
  function isLessonPremium(lesson) {
    return lesson.chapter_no >= PREMIUM_CHAPTER_START && !userHasSubscription;
  }

  async function handleSubscribe(priceId) {
    try {
      const res = await fetch(`${SUPABASE_EDGE_FUNCTION_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      window.open(data.url, '_blank');
    } catch (err) {
      console.error('Stripe checkout failed', err);
      alert('Failed to start checkout');
    }
  }

  // --------------------- RENDER LESSON CARD ---------------------
  const renderLessonCard = (item) => {
    const compositeKey = `Ch${item.chapter_no}_L${item.lesson_no}`;
    const legacyKey = `${item.chapter_no}_${item.lesson_no}`;
    const canonicalId = item.lesson_id ? String(item.lesson_id) : String(computePackedLessonId(item.chapter_no, item.lesson_no));
    const numericKey = String(canonicalId);

    // Check multiple keys for transition compatibility:
    //  - canonical numeric lesson_id (preferred)
    //  - legacy composite "chapter_lesson"
    //  - older composite format "ChX_LY"
    const isCompleted = !!completedMap[numericKey] || !!completedMap[legacyKey] || !!completedMap[compositeKey];
    const isDownloaded = !!downloadedMap[numericKey] || !!downloadedMap[legacyKey] || !!downloadedMap[compositeKey] || !!downloadedMap[String(item.lesson_no)];
    const isDownloading = !!downloadingMap[numericKey] || !!downloadingMap[legacyKey];

    const premiumLocked = isLessonPremium(item);

    return (
      <View style={[styles.card, premiumLocked && { opacity: 0.4 }]}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => {
            if (premiumLocked) return setShowSubscriptionModal(true);
            navigation.navigate('Lesson', {
              chapter_no: item.chapter_no,
              lesson_no: item.lesson_no,
              lesson_title: item.lesson_title,
              // pass canonical lesson_id if available for fast resolution in LessonScreen
              lessonId: item.lesson_id ?? computePackedLessonId(item.chapter_no, item.lesson_no),
            });
          }}
        >
          <Text style={styles.title}>{item.lesson_title}</Text>
          <Text style={styles.subtitle}>{item.lesson_title_translation}</Text>
        </TouchableOpacity>

        {premiumLocked ? (
          <TouchableOpacity
            style={{ marginRight: 10 }}
            onPress={() => setShowSubscriptionModal(true)}
          >
            <Text style={{ color: '#007aff', fontWeight: '700' }}>Subscribe to unlock</Text>
          </TouchableOpacity>
        ) : isCompleted ? (
          <Ionicons name="checkmark-circle" size={26} color="#4caf50" style={{ marginRight: 10 }} />
        ) : isDownloading ? (
          <ActivityIndicator size="small" color="#007aff" />
        ) : !isDownloaded ? (
          <TouchableOpacity onPress={() => handleDownload(item)}>
            <Ionicons name="download-outline" size={26} color="#007aff" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="cloud-done-outline" size={26} color="#007aff" />
        )}
      </View>
    );
  };

  // --------------------- UI ---------------------
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007aff" />
        <Text style={{ marginTop: 8 }}>Loading lessons...</Text>
      </View>
    );
  }

  const content = chapter_no ? (
    <FlatList
      data={lessons}
      keyExtractor={(item) => `${item.chapter_no}-${item.lesson_no}`}
      renderItem={({ item }) => renderLessonCard(item)}
      contentContainerStyle={{ padding: 16 }}
    />
  ) : (
    <SectionList
      sections={sections}
      keyExtractor={(item) => `${item.chapter_no}-${item.lesson_no}`}
      renderItem={({ item }) => renderLessonCard(item)}
      renderSectionHeader={({ section: { title } }) => <Text style={styles.header}>{title}</Text>}
      contentContainerStyle={{ padding: 16 }}
    />
  );

  return (
    <View style={styles.container}>
      {content}

      {/* ------------------ SUBSCRIPTION MODAL ------------------ */}
      <Modal visible={showSubscriptionModal} transparent animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Unlock Premium Chapters</Text>
            <Text style={{ marginBottom: 20 }}>Choose a subscription plan:</Text>
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={() => handleSubscribe(MONTHLY_PRICE_ID)}
            >
              <Text style={styles.subscribeText}>Monthly NTD 299</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={() => handleSubscribe(YEARLY_PRICE_ID)}
            >
              <Text style={styles.subscribeText}>Yearly NTD 399</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 12 }}
              onPress={() => setShowSubscriptionModal(false)}
            >
              <Text style={{ color: '#007aff' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
    color: '#222',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 17, fontWeight: '600', marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#666' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackground: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000066' },
  modalContainer: { width: '80%', backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  subscribeButton: { width: '100%', backgroundColor: '#007aff', padding: 12, borderRadius: 8, marginBottom: 10 },
  subscribeText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});
