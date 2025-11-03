// screens/LessonScreen.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  useColorScheme,
  PanResponder,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '../contexts/SettingsContext';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from "../services/supabase";
import { Audio } from 'expo-av';
import vocabProgress from '../services/vocabProgress';
import * as FileSystem from 'expo-file-system';


const PROGRESS_KEY = 'lesson.progress.v1';
const COMPLETED_KEY = 'lesson.completed.v1';
const TOTAL_PAGES = 7;
const LESSON_CACHE_PREFIX = 'lesson.cache.v1.'; // + lessonId
const DOWNLOADED_KEY = 'downloaded.lessons.v1';


export default function LessonScreen({ route, navigation }) {
  const chapterParam = route.params?.chapterNo ?? route.params?.chapter_no ?? null;
  const lessonParam = route.params?.lessonNo ?? route.params?.lesson_no ?? route.params?.lessonId ?? null;
  const chapterNum = chapterParam != null ? Number(chapterParam) : null;
  const lessonNum = lessonParam != null ? Number(lessonParam) : null;
  const lessonKey = chapterNum != null ? `${chapterNum}_${lessonNum}` : String(lessonNum);


  const { showPinyin, showTranslation } = useSettings();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';


  const [pageIndex, setPageIndex] = useState(1);
  const [showInfo, setShowInfo] = useState(false);
  const [loadedProgressMap, setLoadedProgressMap] = useState({});
  const [pages, setPages] = useState({}); // pages map: {1: [...], 2: [...], ...}
  const [lessonMeta, setLessonMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  // Vocab sheet state
  const [vocabList, setVocabList] = useState([]);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabError, setVocabError] = useState(null);


  // --- New state for Q&A pages ---
  const [answerInputs, setAnswerInputs] = useState({}); // keyed by page number: {3: '...', 4: '...'}
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [lastCheckCorrect, setLastCheckCorrect] = useState(false);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState('');
  const [lastCorrectAnswer, setLastCorrectAnswer] = useState('');
  const [checking, setChecking] = useState(false); // optional small guard


  // --- Audio UI state (for practice pages) ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0..1
  const [playbackDuration, setPlaybackDuration] = useState(0); // millis


  const scrollRef = useRef(null);
  const soundRef = useRef(null);
  const currentAudioUrlRef = useRef(null);
  const statusUpdateRef = useRef(null);



  // --- Helper: save progress to Supabase ---
  const saveProgressToSupabase = async ({ last_page, completed }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;


      await supabase
        .from('lesson_progress')
        .upsert(
          {
            user_id: user.id,
            lesson_id: lessonKey,
            last_page,
            completed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: ['user_id', 'lesson_id'] }
        );
    } catch (err) {
      console.warn('Supabase save failed:', err?.message ?? err);
    }
  };


 useEffect(() => {
  let cancelled = false;
  (async () => {
    setLoading(true);
    setFetchError(null);
    const cacheKey = `${LESSON_CACHE_PREFIX}${lessonKey}`;
    try {
      console.log('🔹 Fetching lesson:', { chapterNum, lessonNum });

      let query = supabase
        .from('lessons')
        .select('*')
        .order('id', { ascending: true });

      if (chapterNum != null) {
        query = query.eq('chapter_no', chapterNum).eq('lesson_no', lessonNum);
      } else {
        query = query.eq('lesson_no', lessonNum);
      }

      const { data, error } = await query;
      console.log('🔹 Supabase response:', { count: data?.length, error });

      if (error) {
        Alert.alert('Supabase Error', `${error.message}`);
        throw error;
      }

      if (!data || data.length === 0) {
        Alert.alert(
          'No Lesson Data',
          `Lesson not found for chapter=${chapterNum}, lesson=${lessonNum}`
        );

        // no rows found - try fallback to cache
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!cancelled) buildPagesFromRows(parsed);
          setLoading(false);
          return;
        } else {
          setFetchError('No lesson data found.');
          setLoading(false);
          return;
        }
      }

      // success: save to cache and use data
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      if (!cancelled) buildPagesFromRows(data);
      setLoading(false);
    } catch (err) {
      console.warn('Lesson fetch failed, falling back to cache:', err);
      Alert.alert('Lesson Fetch Failed', err.message ?? String(err));

      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!cancelled) buildPagesFromRows(parsed);
          setFetchError(null);
        } else {
          setFetchError('Failed to load lesson (offline and no cache).');
        }
      } catch (e2) {
        setFetchError('Failed to load lesson and cache fallback failed.');
      } finally {
        setLoading(false);
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}, [lessonKey, chapterNum, lessonNum]);

// --- Build pages object from fetched rows ---
const buildPagesFromRows = (rows) => {
  try {
    console.log('🔹 Building pages from rows:', rows.length);
    const pagesMap = {};
    rows.forEach((r) => {
      const p = Number(r.page) || 1;
      if (!pagesMap[p]) pagesMap[p] = [];
      pagesMap[p].push(r);
    });

    if (pagesMap[1] && !pagesMap[2]) {
      pagesMap[2] = pagesMap[1].map((line) => ({ ...line }));
    }

    setPages(pagesMap);
    if (rows.length > 0) {
      setLessonMeta({
        title: rows[0].lesson_title,
        chapter: rows[0].chapter_title,
      });
    } else {
      setLessonMeta({});
    }

    fetchLessonQuestionsAndMerge(pagesMap);
  } catch (err) {
    console.warn('Error in buildPagesFromRows:', err);
    Alert.alert('Build Error', err.message ?? 'Unknown error building pages.');
  }
};

// --- Fetch lesson_questions and merge into pages state (offline-first) ---
const fetchLessonQuestionsAndMerge = async (existingPages = {}) => {
  const storageKey = `lesson_questions_${chapterNum ?? '0'}_${lessonNum}`;

  try {
    console.log('🔹 Fetching questions for', { chapterNum, lessonNum });
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      console.log('✅ Loaded lesson questions from cache:', cachedData.length);
      const newPages = { ...existingPages };
      cachedData.forEach((row) => {
        const p = Number(row.page) || 3;
        newPages[p] = [row];
      });
      setPages(newPages);
      return;
    }

    let query = supabase
      .from('lesson_questions')
      .select('*')
      .in('page', [3, 4, 5])
      .order('page', { ascending: true });

    if (chapterNum != null) {
      query = query.eq('chapter_no', chapterNum).eq('lesson_no', lessonNum);
    } else {
      query = query.eq('lesson_no', lessonNum);
    }

    const { data, error } = await query;
    console.log('🔹 Questions response:', { count: data?.length, error });

    if (error) {
      console.warn('Failed to fetch lesson_questions from Supabase:', error);
      Alert.alert('Question Fetch Error', error.message);
      throw error;
    }

    if (Array.isArray(data)) {
      const newPages = { ...existingPages };
      data.forEach((row) => {
        const p = Number(row.page) || 3;
        newPages[p] = [row];
      });
      setPages(newPages);
      await AsyncStorage.setItem(storageKey, JSON.stringify(data));
      console.log('✅ Fetched lesson questions and cached.');
    }
  } catch (err) {
    console.warn('Error loading lesson_questions:', err);
    Alert.alert('Fetch Error', 'Failed to load practice questions.');
  }
};

// --- Fetch vocab for this lesson when info sheet opens (offline-first) ---
const fetchLessonVocab = async () => {
  // require both chapterNum and lessonNum
  if (chapterNum == null || lessonNum == null) {
    setVocabList([]);
    return;
  }


  const storageKey = `lesson_vocab_${chapterNum}_${lessonNum}`;
  setVocabLoading(true);
  setVocabError(null);


  try {
    // 1️⃣ Try loading from cache first
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      setVocabList(Array.isArray(cachedData) ? cachedData : []);
      console.log('Loaded lesson vocab from cache.');
      return;
    }


    // 2️⃣ If not cached, fetch from Supabase
    const { data, error } = await supabase
      .from('lesson_vocab')
      .select('vocab, vocab_pinyin, vocab_translation')
      .eq('chapter_no', Number(chapterNum))
      .eq('lesson_no', Number(lessonNum))
      .order('id', { ascending: true });


    if (error) throw error;


    const vocabArray = Array.isArray(data) ? data : [];
    setVocabList(vocabArray);


    // 3️⃣ Cache the fetched data
    await AsyncStorage.setItem(storageKey, JSON.stringify(vocabArray));
    console.log('Fetched lesson vocab from Supabase and cached.');
  } catch (err) {
    console.warn('Failed to fetch lesson vocab:', err?.message ?? err);
    setVocabError(String(err?.message ?? err));
    setVocabList([]);
  } finally {
    setVocabLoading(false);
  }
};


// Fetch vocab automatically when info modal is opened
useEffect(() => {
  if (showInfo) {
    fetchLessonVocab();
  }
  // optionally clear on close: keep data so reopening is fast
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showInfo]);


  const attachStatusUpdate = (sound) => {
    const cb = (status) => {
      if (!status || !status.isLoaded) return;


      const dur = status.durationMillis ?? 0;
      const pos = status.positionMillis ?? 0;
      const prog = dur > 0 ? Math.min(1, pos / dur) : 0;


      setPlaybackDuration(dur);
      setPlaybackProgress(prog);


      // If finished, mark not playing (but leave progress at 1)
      if (status.didJustFinish) {
        setIsPlaying(false);
      } else {
        setIsPlaying(!!status.isPlaying);
      }
    };


    statusUpdateRef.current = cb;
    try {
      sound.setOnPlaybackStatusUpdate(cb);
    } catch (e) {
      // ignore
    }
  };


  const clearSound = async () => {
    if (soundRef.current) {
      try {
        soundRef.current.setOnPlaybackStatusUpdate(null);
      } catch (e) {}
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
      currentAudioUrlRef.current = null;
      setIsPlaying(false);
      setPlaybackProgress(0);
      setPlaybackDuration(0);
    }
  };


  const playAudio = async (url) => {
    if (!url) return console.warn('No audio URL provided');
    try {
      // If same url is currently loaded
      if (currentAudioUrlRef.current === url && soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
            return;
          } else {
            // If playback reached (or is very close to) the end, reset to start before playing
            const finishedThreshold = (status.durationMillis ?? 0) - 250;
            if ((status.positionMillis ?? 0) >= Math.max(0, finishedThreshold)) {
              try {
                await soundRef.current.setPositionAsync(0);
              } catch (e) { /* ignore */ }
            }
            await soundRef.current.playAsync();
            setIsPlaying(true);
            return;
          }
        }
      }


      // Different audio — unload existing then load new and play
      await clearSound();


      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      soundRef.current = sound;
      currentAudioUrlRef.current = url;
      attachStatusUpdate(sound);
      setIsPlaying(true);
    } catch (err) {
      console.warn('Audio error:', err);
    }
  };


  // cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        try { soundRef.current.unloadAsync(); } catch (e) {}
      }
    };
  }, []);


  // --- Load saved progress (Supabase first, fallback AsyncStorage) ---
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();


        if (user) {
          const { data, error } = await supabase
            .from('lesson_progress')
            .select('last_page, completed')
            .eq('user_id', user.id)
            .eq('lesson_id', lessonKey)
            .maybeSingle();


          if (data && !error) {
            // if lesson completed and last page is 7 -> show redo popup
            if (data.completed && data.last_page === 7) {
              Alert.alert(
                'Redo lesson?',
                'You’ve already completed this lesson.',
                [
                  {
                    text: 'No',
                    style: 'cancel',
                    onPress: () => navigation.popToTop(),
                  },
                  {
                    text: 'Yes',
                    onPress: () => setPageIndex(1),
                  },
                ],
                { cancelable: false }
              );
            } else {
              // normal resume behavior
              setPageIndex(data.last_page || 1);
            }
            return;
          }
        }


        // fallback AsyncStorage
        const saved = await AsyncStorage.getItem(PROGRESS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setLoadedProgressMap(parsed || {});
          const last = parsed?.[lessonKey];
          if (typeof last === 'number' && last >= 1 && last <= TOTAL_PAGES) {
            setPageIndex(last);
          } else {
            setPageIndex(1);
          }
        } else {
          setPageIndex(1);
        }
      } catch (e) {
        console.warn('Failed to load lesson progress:', e);
        setPageIndex(1);
      }
    })();
  }, [lessonKey, navigation]);


  // --- Save last page locally when pageIndex changes ---
  useEffect(() => {
    (async () => {
      try {
        const next = { ...(loadedProgressMap || {}), [lessonKey]: pageIndex };
        setLoadedProgressMap(next);
        await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save lesson progress:', e);
      }
    })();
  }, [pageIndex, lessonKey]);


// --- Keep latest state in refs so PanResponder reads fresh values ---
const pageIndexRef = React.useRef(pageIndex);
useEffect(() => {
  pageIndexRef.current = pageIndex;
}, [pageIndex]);

// ---------- Add this near other refs / state ----------
const showInfoRef = React.useRef(false);

// keep the ref in sync with state immediately
React.useEffect(() => {
  showInfoRef.current = showInfo;
}, [showInfo]);

// ---------- PanResponder (unchanged logic, but now uses showInfoRef reliably) ----------
const panResponder = React.useRef(
  PanResponder.create({
    // never capture at start — let children handle taps
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,

    // Decide if we want to intercept horizontal motion
    onMoveShouldSetPanResponder: (_, gesture) => {
      // 🚫 stop everything if vocab modal is open
      if (showInfoRef.current) return false;

      // disable on first page
      if ((pageIndexRef.current || 0) <= 1) return false;

      const { dx = 0, dy = 0 } = gesture;
      const isHorizontal = Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.4;
      return isHorizontal;
    },

    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      // same guard — modal open? skip.
      if (showInfoRef.current) return false;
      if ((pageIndexRef.current || 0) <= 1) return false;

      const { dx = 0, dy = 0 } = gesture;
      return Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.4;
    },

    onPanResponderRelease: (_, gesture) => {
      // again, ignore if modal is open (just in case)
      if (showInfoRef.current) return;

      // Swipe right (left→right)
      if (gesture.dx > 60 && Math.abs(gesture.dy) < 120) {
        setPageIndex((prev) => Math.max(1, prev - 1));
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ x: 0, y: 0, animated: true });
        }
      }
    },

    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => {},
  })
).current;




  // --- Finish handler ---
  const handleNext = async () => {
    if (pageIndex < TOTAL_PAGES) {
      setPageIndex((p) => p + 1);
      if (scrollRef.current) scrollRef.current.scrollTo({ x: 0, y: 0, animated: true });
      return;
    }


/// --- Finish branch ---
try {
  // 1️⃣ Update local completed map immediately
  const raw = await AsyncStorage.getItem(COMPLETED_KEY);
  const completedMap = raw ? JSON.parse(raw) : {};
  completedMap[lessonKey] = true; // composite lessonKey like "3-2"
  await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(completedMap));


  // 2️⃣ Fire-and-forget Supabase sync (non-blocking)
  // ensure this returns a Promise (do not await, but catch errors)
  saveProgressToSupabase({ last_page: TOTAL_PAGES, completed: true })
    .catch((err) => console.warn('Background sync error:', err));


  // 3️⃣ Fire-and-forget: mark lesson vocabs learned (background)
  vocabProgress.markLessonVocabsLearned(lessonKey)
    .catch((err) => console.warn('markLessonVocabsLearned failed (background):', err?.message ?? err));


  // 4️⃣ Also schedule a sync attempt (non-blocking) to flush any queued records soon
  vocabProgress.syncPendingVocabUpserts().catch(() => { /* ignore */ });


  // 5️⃣ Optimistic local update: recompute and refresh UI counts
  // Ensure currentUserId exists; fallback to fetching from supabase if not provided
  let userId = currentUserId;
  if (!userId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      userId = authData?.user?.id;
    } catch (uErr) {
      console.warn('Could not get current user id for optimistic update:', uErr);
    }
  }


  if (userId) {
    // recompute vocab for completed lessons (updates AsyncStorage & stats via setStats inside function)
    await computeVocabFromCompletedLessons(userId).catch((err) => {
      console.warn('computeVocabFromCompletedLessons (optimistic) failed:', err);
    });


    // refresh lessons/chapter counts (these return numbers or null)
    const lessonsCompleted = await fetchLessonsCompletedCount(userId).catch((err) => {
      console.warn('fetchLessonsCompletedCount (optimistic) failed:', err);
      return null;
    });
    const chaptersCompleted = await fetchChaptersCompletedCount(userId).catch((err) => {
      console.warn('fetchChaptersCompletedCount (optimistic) failed:', err);
      return null;
    });


    setStats((s) => ({
      ...s,
      lessons: lessonsCompleted ?? s.lessons,
      chapters: chaptersCompleted ?? s.chapters,
    }));
  } else {
    // if no user id available, you may still want to increment local counters optimistically
    // (optional) e.g. setStats(s => ({ ...s, lessons: s.lessons + 1 }));
  }
} catch (err) {
  // top-level local fail: we still attempt background supabase call so user progress isn't lost
  console.warn('Finish handler failed locally:', err);


  // best-effort background sync even if local save failed
  saveProgressToSupabase({ last_page: TOTAL_PAGES, completed: true })
    .catch((err2) => console.warn('Background sync after local fail:', err2));
} finally {
  // 6️⃣ Always navigate back to lesson list (main app)
  navigation.popToTop();
}
};






  // --- New: handle Check Answer for pages 3-5 ---
  const handleCheckAnswer = async () => {
    // guard
    if (checking) return;
    setChecking(true);


    try {
      const pageRows = pages[pageIndex] || [];
      const qRow = pageRows[0];
      if (!qRow) {
        Alert.alert('No question', 'This practice page has no question configured.');
        setChecking(false);
        return;
      }


      const correctAnswer = (qRow.answer ?? '').toString();
      const submitted = (answerInputs[pageIndex] ?? '').toString();


      // per your rule: exact match after trimming & lowercasing
      const normalizedCorrect = correctAnswer.trim().toLowerCase();
      const normalizedSubmitted = submitted.trim().toLowerCase();
      const isCorrect = normalizedCorrect === normalizedSubmitted;


      setLastCorrectAnswer(correctAnswer);
      setLastSubmittedAnswer(submitted);
      setLastCheckCorrect(isCorrect);


      // show bottom sheet modal (non-dismissible except via Next)
      setShowAnswerModal(true);
    } catch (err) {
      console.warn('Check answer error:', err);
      Alert.alert('Error', 'Unable to check the answer right now.');
    } finally {
      setChecking(false);
    }
  };


  // When the modal Next is pressed: close sheet and go to next page (force move-on)
  const handleModalNext = () => {
    setShowAnswerModal(false);
    // go to next page (per your rule, if page 5 -> goes to 6)
    setPageIndex((p) => {
      const next = Math.min(TOTAL_PAGES, p + 1);
      // scroll to top
      if (scrollRef.current) scrollRef.current.scrollTo({ x: 0, y: 0, animated: true });
      return next;
    });
  };


  const headerClose = () => navigation.popToTop();


 
  const CHINESE_FONT_SIZE = 18;
  const SPEAKER_COL_WIDTH = Math.round(CHINESE_FONT_SIZE * 4 * 1.2);


  // --- Render page content based on pages map ---
  const renderPageContent = () => {
    if (loading) {
      return (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#7b4eff" />
          <Text style={{ marginTop: 12 }}>Loading lesson...</Text>
          {fetchError ? <Text style={{ marginTop: 8, color: 'red' }}>{fetchError}</Text> : null}
        </View>
      );
    }


    // Page 1: normal audio per line
    if (pageIndex === 1) {
      const lines = pages[1] || [];
      return (
        <View style={{ marginBottom: 12, marginTop: 12 }}>
          <Text style={localStyles.lessonTitle}>{lessonMeta.title}</Text>
          {lines.map((line, idx) => (
            <View key={idx} style={localStyles.dialogBlock}>
              {/* Row layout: speaker column | content column (chinese/pinyin/translation) | play icon */}
              <View style={localStyles.dialogRow}>
                {/* Speaker column */}
                <View style={[localStyles.speakerColumn, { width: SPEAKER_COL_WIDTH }]}>
                  <Text style={[localStyles.speaker, { fontSize: CHINESE_FONT_SIZE }]}>
                    {line.speaker ? `${line.speaker}：` : ''}
                  </Text>
                </View>


                {/* Content column */}
                <View style={localStyles.contentColumn}>
                  <Text style={[localStyles.chineseText, { fontSize: CHINESE_FONT_SIZE }]}>{line.chinese}</Text>
                  {showPinyin && <Text style={localStyles.pinyinText}>{line.pinyin}</Text>}
                  {showTranslation && <Text style={localStyles.translationText}>{line.translation}</Text>}
                </View>


                {/* Play icon (right, top-aligned) */}
                <TouchableOpacity onPress={() => playAudio(line.normal_audio_url)} style={localStyles.playWrap}>
                  <Ionicons name="play-circle" size={24} color="#7b4eff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      );
    }


    // Page 2: slow audio per line
    if (pageIndex === 2) {
      const lines = pages[2] || [];
      return (
        <View style={{ marginBottom: 12, marginTop: 12 }}>
          <Text style={localStyles.lessonTitle}>{lessonMeta.title} (慢速)</Text>
          {lines.map((line, idx) => (
            <View key={idx} style={localStyles.dialogBlock}>
              <View style={localStyles.dialogRow}>
                <View style={[localStyles.speakerColumn, { width: SPEAKER_COL_WIDTH }]}>
                  <Text style={[localStyles.speaker, { fontSize: CHINESE_FONT_SIZE }]}>
                    {line.speaker ? `${line.speaker}：` : ''}
                  </Text>
                </View>


                <View style={localStyles.contentColumn}>
                  <Text style={[localStyles.chineseText, { fontSize: CHINESE_FONT_SIZE }]}>{line.chinese}</Text>
                  {showPinyin && <Text style={localStyles.pinyinText}>{line.pinyin}</Text>}
                  {showTranslation && <Text style={localStyles.translationText}>{line.translation}</Text>}
                </View>


                <TouchableOpacity onPress={() => playAudio(line.slow_audio_url || line.normal_audio_url)} style={localStyles.playWrap}>
                  <Ionicons name="play-circle" size={24} color="#7b4eff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      );
    }


    // Pages 3-5: practice pages (audio above sentence, then answer input)
    if (pageIndex >= 3 && pageIndex <= 5) {
      const qRow = (pages[pageIndex] && pages[pageIndex][0]) || null;
      const questionText = qRow?.question_text ?? '';
      const audioUrl = qRow?.normal_audio_url ?? qRow?.normal_audio ?? null;


      return (
        <View style={{ paddingVertical: 18 }}>
          <Text style={localStyles.pageHeading}>练习 — 第 {pageIndex} 页</Text>


          {/* AUDIO CONTROL (styled as pill like your screenshot) */}
          <View style={{ paddingHorizontal: 2, marginBottom: 14 }}>
            <View style={localStyles.audioPillWrap}>
              <TouchableOpacity onPress={() => playAudio(audioUrl)} style={localStyles.audioPlayBtn}>
                <Ionicons name={isPlaying && currentAudioUrlRef.current === audioUrl ? 'pause' : 'play'} size={20} color="#fff" />
              </TouchableOpacity>


              <View style={localStyles.audioTrackContainer}>
                {/* track background */}
                <View style={localStyles.audioTrackBackground} />


                {/* filled track */}
                <View style={[localStyles.audioTrackFill, { width: `${Math.max(3, playbackProgress * 100)}%` }]} />
              </View>
            </View>
          </View>


          {/* SENTENCE */}
          <View style={[localStyles.placeholderBox, { alignItems: 'flex-start', width: '100%' }]}>
            <Text style={[localStyles.placeholderText, { marginBottom: 12, alignSelf: 'stretch' }]}>{questionText}</Text>


            {/* ANSWER INPUT */}
            <TextInput
              value={answerInputs[pageIndex] ?? ''}
              onChangeText={(t) => setAnswerInputs((prev) => ({ ...prev, [pageIndex]: t }))}
              placeholder="在此输入你的答案"
              maxLength={100}
              autoCapitalize="none"
              autoCorrect={false}
              style={localStyles.answerInput}
              returnKeyType="done"
              underlineColorAndroid="transparent"
            />


            <Text style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
              提示：答案将以不区分大小写、去首尾空格后精确比对。
            </Text>
          </View>
        </View>
      );
    }


    // Page 6: consolidated audio for the whole lesson
    if (pageIndex === 6) {
      const page6 = pages[6] || [];
      const audioUrl = page6[0]?.normal_audio_url || null;
      return (
        <View style={localStyles.placeholderBox}>
          <Text style={localStyles.pageHeading}>🔊 听力练习（整课）</Text>
          <TouchableOpacity style={localStyles.nextButton} onPress={() => playAudio(audioUrl)}>
            <Text style={localStyles.nextButtonText}>播放全篇音频</Text>
          </TouchableOpacity>
        </View>
      );
    }


    // Page 7: end / summary
    return (
      <View style={localStyles.endBox}>
        <Text style={[localStyles.endTitle, isDark && localStyles.textDark]}>🎉 完成本课！</Text>
        <Text style={[localStyles.endSubtitle, isDark && localStyles.textMuted]}>
          很好！你已经完成了 {lessonMeta.title} 的学习。
        </Text>
      </View>
    );
  };
 // Inside your component function, at the top:

const [scrollY, setScrollY] = useState(0);
const [contentHeight, setContentHeight] = useState(0);
const [listHeight, setListHeight] = useState(0);


// compute top/bottom
const atTop = scrollY <= 0;
const atBottom = scrollY + listHeight >= contentHeight - 1;
// Helper: compute current step size (60% of visible list height, fallback 250px)
const getScrollStep = () => Math.round(listHeight ? listHeight * 0.6 : 250);

// Helper: clamp to valid scroll range and perform programmatic scroll
const scrollBy = (dy) => {
  // If there's nothing to scroll, do nothing
  if (!scrollRef.current || contentHeight <= listHeight) return;

  const maxOffset = Math.max(0, contentHeight - listHeight);
  const target = Math.max(0, Math.min(maxOffset, scrollY + dy));
  scrollRef.current.scrollTo({ y: target, animated: true });

  // optional: update scrollY immediately for UI feedback (ScrollView will also update it soon)
  setScrollY(target);
};

// Simple wrappers for button presses
const onPressUp = () => scrollBy(-getScrollStep());
const onPressDown = () => scrollBy(getScrollStep());



  return (
    <View style={[localStyles.container, isDark && localStyles.containerDark]} {...panResponder.panHandlers}>
      {/* Header */}
      <View style={localStyles.header}>
        <TouchableOpacity onPress={headerClose}>
          <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowInfo(true)}>
          <Ionicons name="information-circle-outline" size={24} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>
      </View>


      <ScrollView ref={scrollRef} style={localStyles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {renderPageContent()}
      </ScrollView>


      <View style={localStyles.footer}>
        {/* Footer button: for pages 3-5 label becomes "Check Answer" and triggers check logic */}
        {pageIndex >= 3 && pageIndex <= 5 ? (
          <TouchableOpacity
            style={[
              localStyles.nextButton,
              (!answerInputs[pageIndex] || answerInputs[pageIndex].trim().length === 0) && localStyles.nextButtonDisabled,
            ]}
            onPress={handleCheckAnswer}
            disabled={!answerInputs[pageIndex] || answerInputs[pageIndex].trim().length === 0}
          >
            <Text style={localStyles.nextButtonText}>Check Answer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={localStyles.nextButton} onPress={handleNext}>
            <Text style={localStyles.nextButtonText}>{pageIndex < TOTAL_PAGES ? 'Next' : 'Finish'}</Text>
          </TouchableOpacity>
        )}
      </View>



<Modal
  visible={showInfo}
  transparent
  animationType="fade"
  onRequestClose={() => setShowInfo(false)}
>
  {/* dimmed backdrop; tapping outside closes */}
  <Pressable style={localStyles.modalBackdrop} onPress={() => setShowInfo(false)}>
    {/* inner wrapper to absorb taps */}
    <Pressable onPress={() => {}} style={{ flex: 1 }}>
      <View style={localStyles.popupAbsorb}>
        <View style={[localStyles.popupContainer, isDark && localStyles.infoBoxDark]}>
          {/* Header */}
          <View style={localStyles.popupHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[localStyles.infoTitle, isDark && localStyles.textDark]}>
                Vocab — {lessonMeta.title || ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowInfo(false)} style={{ padding: 8, marginLeft: 8 }}>
              <Ionicons name="close" size={22} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={localStyles.popupBody}>
            {vocabLoading ? (
              <View style={{ padding: 18, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#7b4eff" />
              </View>
            ) : vocabError ? (
              <View style={{ padding: 18 }}>
                <Text style={{ color: 'red' }}>Failed to load vocab: {vocabError}</Text>
              </View>
            ) : vocabList.length === 0 ? (
              <View style={{ padding: 18 }}>
                <Text style={localStyles.placeholderText}>No vocab for this lesson.</Text>
              </View>
            ) : (
              <>
                {/* Go Up Button (floating icon) */}
<TouchableOpacity
  onPress={onPressUp}
  disabled={atTop}
  style={{
    position: 'absolute',
    top: 50, // adjust to fit inside popupBody
    alignSelf: 'center',
    backgroundColor: isDark ? '#222' : '#fff',
    borderRadius: 25,
    padding: 10,
    opacity: atTop ? 0.3 : 0.95,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5, // Android shadow
  }}
>
  <Ionicons name="chevron-up" size={24} color={isDark ? '#fff' : '#000'} />
</TouchableOpacity>

                
                {/* Scrollable vocab list */}
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                  onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
                  scrollEventThrottle={16}
                  onContentSizeChange={(w, h) => setContentHeight(h)}
                  onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
                >
                  {vocabList.map((v, i) => (
                    <View key={`${v.vocab}-${i}`} style={localStyles.vocabRow}>
                      <View style={localStyles.vocabColLeft}>
                        <Text style={localStyles.vocabText}>{v.vocab}</Text>
                      </View>
                      <View style={localStyles.vocabColMiddle}>
                        <Text style={localStyles.vocabPinyin}>{v.vocab_pinyin}</Text>
                      </View>
                      <View style={localStyles.vocabColRight}>
                        <Text style={localStyles.vocabTranslation}>{v.vocab_translation}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
  
                
                {/* Go Down Button (floating icon) */}
<TouchableOpacity
  onPress={onPressDown}
  disabled={atBottom}
  style={{
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: isDark ? '#222' : '#fff',
    borderRadius: 25,
    padding: 10,
    opacity: atBottom ? 0.3 : 0.95,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  }}
>
  <Ionicons name="chevron-down" size={24} color={isDark ? '#fff' : '#000'} />
</TouchableOpacity>

              </>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  </Pressable>
</Modal>






      {/* --- Bottom-sheet style modal for showing check result (transparent backdrop, but modal blocks interactions) --- */}
      <Modal
        visible={showAnswerModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          /* prevent Android back close — ignore */
        }}
      >
        {/* Transparent backdrop so screen doesn't dim, but Modal blocks interaction */}
        <View style={localStyles.transparentBackdrop}>
          <View style={localStyles.sheetContainer}>
            <View style={localStyles.sheetHandle} />


            <Text style={[localStyles.sheetTitle, lastCheckCorrect ? { color: '#1f9d55' } : { color: '#d64545' }]}>
              {lastCheckCorrect ? '回答正确 ✅' : '回答错误 ❌'}
            </Text>


            <Text style={localStyles.sheetLabel}>你的回答：</Text>
            <Text style={localStyles.sheetAnswer}>{lastSubmittedAnswer || '（未输入）'}</Text>


            <Text style={[localStyles.sheetLabel, { marginTop: 10 }]}>正确答案：</Text>
            <Text style={localStyles.sheetCorrect}>{lastCorrectAnswer}</Text>


            <TouchableOpacity style={localStyles.sheetNextButton} onPress={handleModalNext}>
              <Text style={localStyles.sheetNextButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}


// --- Styles ---
const localStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerDark: { backgroundColor: '#0b0b0b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, marginTop: 30 },
  content: { flex: 1, paddingHorizontal: 14 },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd' },
  nextButton: { alignSelf: 'center', backgroundColor: '#7b4eff', paddingHorizontal: 90, paddingVertical: 10, borderRadius: 999, marginBottom: 40 },
  nextButtonDisabled: { opacity: 0.55 }, // faded look when disabled
  nextButtonText: { color: '#fff', fontWeight: '600' },
  lessonTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  dialogBlock: { marginBottom: 6 },


  /* DIALOG ROW: speaker | content | play */
  dialogRow: { flexDirection: 'row', alignItems: 'flex-start' },


  speakerColumn: {
  paddingRight: 0, // smaller gap to content column
},


  speaker: {
    fontWeight: '500',
    textAlign: 'left',
    // ensure long speaker names truncate
    includeFontPadding: false,
  },


  /* content column: takes remaining space, top-aligned */
  contentColumn: {
    flex: 1,
    paddingRight: 4,
    paddingLeft: 0,
  },
  chineseText: { fontSize: 15, fontWeight: '500', flexShrink: 1, flexWrap: 'wrap' },
  pinyinText: { fontSize: 13, color: '#555', marginTop: 4 },
  translationText: { fontSize: 13, color: '#666', marginTop: 4 },


  /* play button wrapper: place on the right, top-aligned */
  playWrap: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingLeft: 6,
  },


  placeholderBox: { backgroundColor: '#f3f3f3', padding: 16, borderRadius: 10, marginVertical: 10, alignItems: 'center' },
  pageHeading: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  placeholderText: { fontSize: 15, color: '#444' },
  endBox: { alignItems: 'center', padding: 24 },
  endTitle: { fontSize: 22, fontWeight: '800' },
  endSubtitle: { fontSize: 16, marginTop: 8 },
  notFoundText: { fontSize: 16, color: '#900', padding: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start', paddingTop: 70, paddingHorizontal: 14 },
  infoBox: { backgroundColor: '#fff', padding: 14, borderRadius: 10, alignSelf: 'flex-end', width: '86%' },
  infoBoxDark: { backgroundColor: '#1a1a1a' },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  infoText: { fontSize: 14 },
  textDark: { color: '#fff' },
  textMuted: { color: '#a9a9a9' },


  /* --- New styles for Q&A UI --- */
  answerInput: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderColor: '#ddd',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    width: '100%',
  },


  /* AUDIO PILL (like your screenshot) */
  audioPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7b4eff', // purple pill
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%',
    height: 56,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  audioTrackContainer: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  audioTrackBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  audioTrackFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },


  /* Bottom-sheet like modal (transparent backdrop per your request) */
  transparentBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', // no dimming
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    minHeight: 220,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sheetLabel: { fontSize: 13, color: '#666', marginTop: 6 },
  sheetAnswer: { fontSize: 16, marginTop: 4 },
  sheetCorrect: { fontSize: 16, marginTop: 4, fontWeight: '700' },
  sheetNextButton: {
    marginTop: 18,
    alignSelf: 'center',
    backgroundColor: '#7b4eff',
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderRadius: 999,
  },
  sheetNextButtonText: { color: '#fff', fontWeight: '700' },


  /* Full-screen sheet styles for vocab */
fullSheetBackdrop: {
  flex: 1,
  justifyContent: 'flex-end',
  backgroundColor: 'transparent',
},
fullSheetContainer: {
  maxHeight: '92%',
  width: '100%',
  backgroundColor: '#fff',
  borderTopLeftRadius: 14,
  borderTopRightRadius: 14,
  paddingTop: 12,
  paddingHorizontal: 16,
  paddingBottom: 24,
},
sheetHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
},
sheetSubTitle: {
  fontSize: 13,
  color: '#666',
  marginTop: 4,
},
fullSheetBody: {
  flex: 1,
  marginTop: 6,
},
vocabRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  paddingVertical: 10,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: '#eee',
},
vocabColLeft: {
  width: 110,
  paddingRight: 8,
},
vocabColMiddle: {
  width: 120,
  paddingRight: 8,
},
vocabColRight: {
  flex: 1,
},
vocabText: {
  fontSize: 16,
  fontWeight: '700',
},
vocabPinyin: {
  fontSize: 14,
  color: '#444',
},
vocabTranslation: {
  fontSize: 14,
  color: '#666',
},


// centered popup styles (80% height)
popupAbsorb: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'flex-start', // align popup toward top instead of center
},


popupContainer: {
  marginTop: '12%',       // position slightly below the header
  height: '75%',          // slightly shorter to fit comfortably
  width: '92%',
  backgroundColor: '#fff',
  borderRadius: 14,
  paddingTop: 12,
  paddingHorizontal: 14,
  paddingBottom: 18,
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 6,
},




popupHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
},
popupBody: {
  flex: 1,
  marginTop: 6,
},
// reuse sheetSubTitle and vocab row styles you previously added
scrollButton: {
  position: 'absolute',
  left: '50%',
  transform: [{ translateX: -14 }], // centers horizontally
  zIndex: 10,
  backgroundColor: 'rgba(255,255,255,0.6)',
  borderRadius: 16,
  padding: 4,
},


});
