// ProgressScreen.js
import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import Svg, { Line, Path, Circle, G, Text as SvgText } from "react-native-svg";
import { supabase } from "../services/supabase";
import vocabProgress from "../services/vocabProgress";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const PENDING_KEY = "time_spent:pending_queue";
const TIME_BY_DAY_KEY = "TIME_SPENT_BY_DAY.v1"; // new: per-day minutes stored locally

const CHART_PADDING = 16;
const LEFT_COLUMN_WIDTH = 36;
const CHART_HEIGHT = 160;
const Y_TICKS = [0, 10, 20, 30];
const MAX_Y = 30;
const DAYS = 7;

const STORAGE_KEYS = {
  VOCAB_COUNT: "VOCAB_COUNT.v1",
  TIME_TOTAL: "TIME_SPENT_TOTAL.v1",
  TIME_PENDING: "TIME_SPENT_PENDING.v1",
  VOCAB_LEARNED_LIST: "VOCAB_LEARNED_LIST.v1",
  VOCAB_LEARNED_COUNT: "VOCAB_LEARNED_COUNT.v1",
};

// --- helper: sync pending queue when back online ---
async function syncPendingEntries(userId) {
  try {
    const pendingStr = await AsyncStorage.getItem(PENDING_KEY);
    if (!pendingStr) return;
    const queue = JSON.parse(pendingStr) || [];
    if (!Array.isArray(queue) || queue.length === 0) return;

    for (const entry of queue) {
      const { dayISO, minutes } = entry;
      await supabase.rpc("add_time_spent", {
        p_user: userId,
        p_day: dayISO,
        p_minutes: minutes,
      });
    }
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (err) {
    console.warn("syncPendingEntries failed", err?.message ?? err);
  }
}

// --- per-day local storage helpers ---
async function loadLocalDayMap() {
  try {
    const raw = await AsyncStorage.getItem(TIME_BY_DAY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    console.warn("loadLocalDayMap error", err?.message ?? err);
    return {};
  }
}
async function saveLocalDayMap(map) {
  try {
    await AsyncStorage.setItem(TIME_BY_DAY_KEY, JSON.stringify(map || {}));
  } catch (err) {
    console.warn("saveLocalDayMap error", err?.message ?? err);
  }
}
function isoForDate(d) {
  return d.toISOString().slice(0, 10);
}

// SimpleLineChart (presentational) - only uses props, no AsyncStorage
function SimpleLineChart({ labels = [], data = [], userId }) {
  const [windowWidth, setWindowWidth] = useState(Dimensions.get("window").width);

  useEffect(() => {
    const sub = Dimensions.addEventListener?.("change", ({ window }) => {
      setWindowWidth(window.width);
    });
    if (!sub && Dimensions.addEventListener) {
      const listener = Dimensions.addEventListener("change", ({ window }) => setWindowWidth(window.width));
      return () => listener?.remove?.();
    }
    return () => sub?.remove?.();
  }, []);

  // Ensure we always have exactly DAYS entries (fallback to zeros)
  const safeLabels = (labels && labels.length === DAYS) ? labels : (() => {
    const today = new Date();
    const fallback = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      fallback.push(d.toLocaleDateString("en-US", { weekday: "short" }));
    }
    return fallback;
  })();

  const safeData = (data && data.length === DAYS) ? data : new Array(DAYS).fill(0);

  // compute sizes
  const totalPadding = 16 * 2;
  const effectiveLeftWidth = Math.max(20, Math.round(LEFT_COLUMN_WIDTH * 0.7));
  const width = Math.max(320, windowWidth - totalPadding);
  const chartWidth = Math.max(160, width - effectiveLeftWidth - CHART_PADDING * 2);
  const colWidth = chartWidth / DAYS;
  const svgWidth = chartWidth + CHART_PADDING * 2;
  const EXTRA_TOP = 25;
  const svgHeight = CHART_HEIGHT + CHART_PADDING * 2 + EXTRA_TOP + 28;
  const GRAPH_OFFSET_Y = 30;
  const ARROW_Y_OFFSET = -20;

  const points = safeData.slice();

  const svgPoints = points.map((val, i) => {
    const x = CHART_PADDING + colWidth * i + colWidth / 2;
    const yRatio = Math.max(0, Math.min(val / MAX_Y, 1));
    const y = CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT - yRatio * CHART_HEIGHT;
    return { x, y, val, i };
  });

  const pathD = svgPoints
    .map((p, idx) => {
      const clampedX = Math.min(p.x, svgWidth - CHART_PADDING - 4);
      return `${idx === 0 ? "M" : "L"} ${clampedX.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <View style={{ padding: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ width: effectiveLeftWidth, height: CHART_HEIGHT + CHART_PADDING * 2 + GRAPH_OFFSET_Y, marginLeft: -4 }}>
          {Y_TICKS.slice().reverse().map((tick) => {
            const y = CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT * (1 - tick / MAX_Y);
            return (
              <Text key={`yt-${tick}`} numberOfLines={1} allowFontScaling={false} includeFontPadding={false} style={{
                position: "absolute", left: 0, top: y - 8, width: effectiveLeftWidth, textAlign: "right", paddingRight: 6, fontSize: 12, lineHeight: 14, color: "#444",
              }}>
                {tick}
              </Text>
            );
          })}
        </View>

        <Svg width={svgWidth + 36} height={svgHeight}>
          {Y_TICKS.map((tick) => {
            const y = CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT - (tick / MAX_Y) * CHART_HEIGHT;
            const xAxisEnd = svgWidth - CHART_PADDING;
            return <Line key={`grid-${tick}`} x1={0} x2={xAxisEnd} y1={y} y2={y} stroke="#EEE" strokeWidth={1} />;
          })}

          <Line x1={0} x2={0} y1={CHART_PADDING + GRAPH_OFFSET_Y - 20} y2={CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT} stroke="#888" strokeWidth={2} />
          <Path d={`M ${-6} ${CHART_PADDING + GRAPH_OFFSET_Y + 1 + ARROW_Y_OFFSET} L ${6} ${CHART_PADDING + GRAPH_OFFSET_Y + 1 + ARROW_Y_OFFSET} L 0 ${CHART_PADDING + GRAPH_OFFSET_Y - 8 + ARROW_Y_OFFSET} Z`} fill="#888" />

          <SvgText x={15} y={CHART_PADDING + GRAPH_OFFSET_Y - 30} fontSize="12" fill="#444" alignmentBaseline="middle" textAnchor="middle">mins</SvgText>

          <Line x1={0} x2={svgWidth - CHART_PADDING} y1={CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT} y2={CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT} stroke="#888" strokeWidth={1.5} />
          <Path d={`M ${svgWidth - CHART_PADDING - 8} ${CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT - 6} L ${svgWidth - CHART_PADDING - 8} ${CHART_PADDING + CHART_HEIGHT + GRAPH_OFFSET_Y + 6} L ${svgWidth - CHART_PADDING + 6} ${CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT} Z`} fill="#888" />
          <SvgText x={svgWidth - CHART_PADDING + 18} y={CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT + 4} fontSize="12" fill="#444" alignmentBaseline="middle">day</SvgText>

          <Path d={pathD} fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          {svgPoints.map((p) => <Circle key={`pt-${p.i}`} cx={Math.min(p.x, svgWidth - CHART_PADDING - 4)} cy={p.y} r={4} fill="#000" />)}

          {svgPoints.map((p) => {
            const label = safeLabels[p.i] ?? "";
            return <SvgText key={`xl-${p.i}`} x={Math.min(p.x, svgWidth - CHART_PADDING - 4)} y={CHART_PADDING + GRAPH_OFFSET_Y + CHART_HEIGHT + 16} fontSize="12" fill="#666" alignmentBaseline="hanging" textAnchor="middle">{label}</SvgText>;
          })}
        </Svg>
      </View>
    </View>
  );
}

 
// --- main screen ---
export default function ProgressScreen() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState({ labels: [], minutes: [] });
  const [stats, setStats] = useState({
    vocab: 0,
    lessons: 0,
    timeSpent: 0,
    chapters: 0,
  });
  const [vocabModalVisible, setVocabModalVisible] = useState(false);
  const [learnedList, setLearnedList] = useState([]);
  const [learnedLoading, setLearnedLoading] = useState(false);

  const cached = useRef({
    vocabCached: null,
    timeTotalCached: null,
    timePendingCached: 0,
  });

  // network listener unsubscribe ref
  const netUnsubscribeRef = useRef(null);

  // timer ref for tracking app-open time
  const timerRef = useRef(null);
  // in ProgressScreen.js (top-level inside component)




  useEffect(() => {
    init();
    vocabProgress.syncPendingVocabUpserts().catch(() => {});
    // subscribe to connectivity changes
    netUnsubscribeRef.current = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        // when regained connectivity, sync with server
        fetchAndSyncServerProgress().catch((err) =>
          console.warn("sync on reconnect failed:", err?.message ?? err)
        );
      }
    });

    // start minute timer while screen mounted
    timerRef.current = setInterval(() => {
      // add 1 minute each minute open
      addLocalTime(1);
    }, 60 * 1000);

    return () => {
      // cleanup net listener
      if (netUnsubscribeRef.current) netUnsubscribeRef.current();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      setLoading(true);
      await loadLocalStats();
      await loadLocalChartDaysIntoState(); // overlay local day values into chart
      await fetchAndSyncServerProgress();
    } catch (err) {
      console.warn("init error", err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }

  // --- Local storage helpers ---
  async function loadLocalStats() {
    try {
      const [vocabStr, timeTotalStr, timePendingStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.VOCAB_COUNT),
        AsyncStorage.getItem(STORAGE_KEYS.TIME_TOTAL),
        AsyncStorage.getItem(STORAGE_KEYS.TIME_PENDING),
      ]);

      const vocab = vocabStr != null ? Number(vocabStr) : null;
      const timeTotal = timeTotalStr != null ? Number(timeTotalStr) : null;
      const timePending = timePendingStr != null ? Number(timePendingStr) : 0;

      cached.current.vocabCached = Number.isFinite(vocab) ? vocab : null;
      cached.current.timeTotalCached = Number.isFinite(timeTotal) ? timeTotal : null;
      cached.current.timePendingCached = Number.isFinite(timePending) ? timePending : 0;

      setStats((s) => ({
        ...s,
        vocab: cached.current.vocabCached ?? s.vocab,
        timeSpent:
          (cached.current.timeTotalCached ?? s.timeSpent) + (cached.current.timePendingCached ?? 0),
      }));
    } catch (err) {
      console.warn("loadLocalStats error", err?.message ?? err);
    }
  }

  // load local per-day minutes and merge into chartData (only if chartData empty)
  async function loadLocalChartDaysIntoState() {
    try {
      const localMap = await loadLocalDayMap();
      const today = new Date();
      const labels = [];
      const minutes = [];
      for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
        const iso = isoForDate(d);
        const localVal = Number(localMap[iso] ?? null);
        minutes.push(localVal != null ? localVal : 0);
      }
      // Only set chartData if empty; otherwise we'll rely on server merge later (but local overlay should be applied after server fetch too)
      setChartData((prev) => {
        if (!prev || !prev.labels || prev.labels.length === 0) return { labels, minutes };
        return prev;
      });
    } catch (err) {
      console.warn("loadLocalChartDaysIntoState error", err?.message ?? err);
    }
  }

  // overlayLocalDayValues: deterministic merge that accepts a base chart and returns merged data
// (no reliance on reading `chartData` state inside)
async function overlayLocalDayValues(base = null) {
  try {
    const localMap = await loadLocalDayMap();

    // If caller did not provide a base, use current chartData as fallback
    const source = base || (chartData && chartData.labels ? { labels: chartData.labels.slice(), minutes: chartData.minutes.slice() } : null);

    if (!source || !source.labels) {
      // nothing to overlay onto
      return null;
    }

    const labels = source.labels.slice();
    const minutes = (source.minutes && source.minutes.slice()) || new Array(labels.length).fill(0);
    const today = new Date();

    // For each label index compute the ISO for the corresponding day and overlay localMap value if present
    for (let i = 0; i < labels.length; i++) {
      // labels are ordered oldest->newest; compute that day's date
      const d = new Date(today);
      d.setDate(today.getDate() - (labels.length - 1 - i));
      const iso = isoForDate(d);
      if (localMap[iso] != null) {
        // prefer local (max to keep highest of server/local if you want that behavior)
        minutes[i] = Math.max(Number(minutes[i] || 0), Number(localMap[iso] || 0));
      }
    }

    // return merged result for caller to set into state
    return { labels, minutes };
  } catch (err) {
    console.warn("overlayLocalDayValues error", err?.message ?? err);
    return null;
  }
}

  
  async function fetchAndSyncServerProgress() {
  // --- Step 1: Restore time from AsyncStorage ---
  const storedTotal = await AsyncStorage.getItem(STORAGE_KEYS.TIME_TOTAL);
  const pending = Number(cached.current.timePendingCached || 0);
  if (storedTotal != null) {
    const totalToShow = Number(storedTotal) + pending;
    cached.current.timeTotalCached = totalToShow;
    setStats((s) => ({ ...s, timeSpent: totalToShow }));
  }

  try {
    // Fetch user
    const { data: { user } = {}, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return;
    const userId = user.id;

    // 1️⃣ Update lessons and chapters
    await supabase.rpc("update_user_progress_counts", { p_user: userId });
  

    // 2️⃣ Fetch updated counts
    const { data: progressRows, error: progressErr } = await supabase
      .from("user_progress")
      .select("lessons_completed, chapters_completed")
      .eq("user_id", userId)
      .maybeSingle();

    if (!progressErr && progressRows) {
      setStats((s) => ({
        ...s,
        lessons: Number(progressRows.lessons_completed || 0),
        chapters: Number(progressRows.chapters_completed || 0),
      }));
    } else {
      console.warn("Failed to fetch user_progress:", progressErr);
    }

    // --- Fetch progress summary ---
    const { data, error } = await supabase.rpc("get_progress_summary", { p_user: userId });

    if (error || !data || !data[0]) {
      // fallback
      await fetchProgressFallback(userId);
      await trySyncPendingTime(userId);
      await computeVocabFromCompletedLessons(userId).catch(() => {});
      return;
    }

    const row = data[0] || {};
    const progress = row.progress || {};
    const last7 = row.last7 || [];

    // --- Chart data ---
    const labels = [];
    const minutes = [];
    const today = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));

      const found = (last7 || []).find((t) => {
        const dayStr = typeof t.day === "string" ? t.day : (t.day && t.day.toString && t.day.toString());
        const dISO = d.toISOString().slice(0, 10);
        return dayStr && dayStr.slice(0, 10) === dISO;
      });
      minutes.push(found ? Number(found.minutes) || 0 : 0);
    }
    // Merge local per-day overrides deterministically and update state
    const merged = await overlayLocalDayValues({ labels, minutes });
    if (merged) {
      setChartData(merged);
    } else {
      // fallback to server values if overlay failed
      setChartData({ labels, minutes });
    }

    // --- Server totals ---
    const serverVocab = Number(progress.vocab_count || 0);
    const serverLessons = Number(progress.lessons_completed || 0);
    const serverTime = Number(progress.total_minutes || 0);
    const serverChapters = Number(progress.chapters_completed || 0);

    // Combine pending time and server time
    const localPending = cached.current.timePendingCached || 0;
    const totalTime = serverTime + localPending;

    if (localPending > 0) {
      try {
        const dayISO = new Date().toISOString().slice(0, 10);
        const { error: addErr } = await supabase.rpc("add_time_spent", {
          p_user: userId,
          p_day: dayISO,
          p_minutes: localPending,
        });
        if (addErr) throw addErr;

        cached.current.timePendingCached = 0;
        await AsyncStorage.setItem(STORAGE_KEYS.TIME_PENDING, "0");

        // Update total time and cache it
        cached.current.timeTotalCached = totalTime;
        await AsyncStorage.setItem(STORAGE_KEYS.TIME_TOTAL, String(totalTime));
        console.log("Saved totalTime to AsyncStorage: ", totalTime); // Log after saving to AsyncStorage
        setStats((s) => ({ ...s, timeSpent: totalTime }));
      } catch (err) {
        console.warn("failed to sync pending time, will retry later:", err?.message ?? err);
        // Fallback if sync fails, still set stats with totalTime
        setStats((s) => ({ ...s, timeSpent: totalTime }));
      }
    } else {
      // No pending time, use server time directly
      cached.current.timeTotalCached = serverTime;
      await AsyncStorage.setItem(STORAGE_KEYS.TIME_TOTAL, String(serverTime));

      // Set stats with totalTime
      setStats((s) => ({ ...s, timeSpent: totalTime }));
    }

    // --- Vocab --- 
    if (cached.current.vocabCached == null) {
      // try compute from completed lessons list
      const computed = await computeVocabFromCompletedLessons(userId);
      if (computed != null) {
        cached.current.vocabCached = computed;
        await AsyncStorage.setItem(STORAGE_KEYS.VOCAB_COUNT, String(computed));
      } else {
        // fallback to RPC value
        cached.current.vocabCached = serverVocab;
        await AsyncStorage.setItem(STORAGE_KEYS.VOCAB_COUNT, String(serverVocab));
      }
    }

    // Update stats with vocab count
    setStats((s) => ({
      ...s,
      vocab: cached.current.vocabCached,
      lessons: serverLessons,
      chapters: serverChapters,
    }));
  } catch (err) {
    console.warn("fetchAndSyncServerProgress error", err?.message ?? err);
  }
}


  async function fetchProgressFallback(userId) {
    try {
      const { data: timeData } = await supabase
        .from("time_spent")
        .select("day, minutes")
        .eq("user_id", userId)
        .gte("day", new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order("day", { ascending: true });

      const labels = [];
      const minutes = [];
      const today = new Date();
      for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
        const found = (timeData || []).find((r) => new Date(r.day).toDateString() === d.toDateString());
        minutes.push(found ? found.minutes : 0);
      }

      const { data: progressData } = await supabase
        .from("user_progress")
        .select("lessons_completed, chapters_completed, vocab_count, total_minutes")
        .eq("user_id", userId)
        .maybeSingle();

      const mergedFallback = await overlayLocalDayValues({ labels, minutes });
      setChartData(mergedFallback || { labels, minutes });

      // --- Update stats.timeSpent with server + pending ---
      const serverTotal = Number(progressData?.total_minutes || 0);
      const pendingNow = Number(cached.current.timePendingCached || 0);
      const displayTotal = serverTotal + pendingNow;

      cached.current.timeTotalCached = displayTotal;
      await AsyncStorage.setItem(STORAGE_KEYS.TIME_TOTAL, String(displayTotal));

      setStats((s) => ({
        ...s,
        timeSpent: displayTotal,
        lessons: Number(progressData?.lessons_completed || s.lessons),
        chapters: Number(progressData?.chapters_completed || s.chapters),
        vocab: Number(progressData?.vocab_count || s.vocab),
      }));


    } catch (err) {
      console.warn("fetchProgressFallback error", err?.message ?? err);
    }
  }

  async function trySyncPendingTime(userId) {
    const pending = Number(cached.current.timePendingCached || 0);
    if (!pending || pending <= 0) return;
    try {
      const dayISO = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.rpc("add_time_spent", {
        p_user: userId,
        p_day: dayISO,
        p_minutes: pending,
      });
      if (error) throw error;

      cached.current.timePendingCached = 0;
      await AsyncStorage.setItem(STORAGE_KEYS.TIME_PENDING, "0");

      const { data } = await supabase.rpc("get_progress_summary", { p_user: userId });
      const serverTotal = (data && data[0] && data[0].progress && Number(data[0].progress.total_minutes)) || null;
      if (serverTotal != null) {
        cached.current.timeTotalCached = serverTotal;
        await AsyncStorage.setItem(STORAGE_KEYS.TIME_TOTAL, String(serverTotal));
        setStats((s) => ({ ...s, timeSpent: serverTotal }));
      }
    } catch (err) {
      console.warn("trySyncPendingTime failed (will keep pending):", err?.message ?? err);
    }
  }

  // Modified to also update per-day local storage and chart today value immediately
  async function addLocalTime(minutes) {
    try {
      const prevPending = Number(cached.current.timePendingCached || 0);
      const prevTotal = Number(cached.current.timeTotalCached || 0);

      const newPending = prevPending + Number(minutes);
      const newTotal = (prevTotal || 0) + Number(minutes);

      cached.current.timePendingCached = newPending;
      cached.current.timeTotalCached = newTotal;

      await AsyncStorage.setItem(STORAGE_KEYS.TIME_PENDING, String(newPending));
      await AsyncStorage.setItem(STORAGE_KEYS.TIME_TOTAL, String(newTotal));

      setStats((s) => ({ ...s, timeSpent: newTotal }));

      // update local per-day map for today's date
      const todayISO = isoForDate(new Date());
      const dayMap = await loadLocalDayMap();
      const prevDayVal = Number(dayMap[todayISO] || 0);
      const newDayVal = prevDayVal + Number(minutes);
      dayMap[todayISO] = newDayVal;
      await saveLocalDayMap(dayMap);

      // update chartData's last day (assumes labels cover 7 days ending today)
      setChartData((prev) => {
        if (!prev) return prev;
        const labels = prev.labels ? prev.labels.slice() : [];
        const minutesArr = prev.minutes ? prev.minutes.slice() : [];
        // find today's index (last)
        const idx = minutesArr.length - 1;
        if (idx >= 0) {
          minutesArr[idx] = (Number(minutesArr[idx] || 0) + Number(minutes));
        } else {
          // fallback: rebuild last-7
          const today = new Date();
          const newLabels = [];
          const newMinutes = [];
          for (let i = DAYS - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            newLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
            const iso = isoForDate(d);
            newMinutes.push(Number(dayMap[iso] || 0));
          }
          return { labels: newLabels, minutes: newMinutes };
        }
        return { labels, minutes: minutesArr };
      });

      // best-effort immediate push
      try {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (user) {
          const userId = user.id;
          const dayISO = new Date().toISOString().slice(0, 10);
          const { error } = await supabase.rpc("add_time_spent", {
            p_user: userId,
            p_day: dayISO,
            p_minutes: newPending,
          });
          if (!error) {
            cached.current.timePendingCached = 0;
            await AsyncStorage.setItem(STORAGE_KEYS.TIME_PENDING, "0");

            const { data } = await supabase.rpc("get_progress_summary", { p_user: userId });
            const serverTotal = (data && data[0] && data[0].progress && Number(data[0].progress.total_minutes)) || null;
            if (serverTotal != null) {
              cached.current.timeTotalCached = serverTotal;
              await AsyncStorage.setItem(STORAGE_KEYS.TIME_TOTAL, String(serverTotal));
              setStats((s) => ({ ...s, timeSpent: serverTotal }));
            }
          } else {
            // if push failed, keep pending (already stored above)
          }
        }
      } catch (err) {
        // can't sync now, keep pending
      }
    } catch (err) {
      console.warn("addLocalTime error", err?.message ?? err);
    }
  }

  // --- compute vocab by summing lesson_vocab_count for lessons the user actually completed ---
  async function computeVocabFromCompletedLessons(userId) {
    try {
      // get completed lessons for this user from lesson_progress
      const { data: completedRows, error: compErr } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("user_id", userId)
        .eq("completed", true);

      if (compErr) {
        console.warn("computeVocab: failed to read lesson_progress:", compErr.message ?? compErr);
        return null;
      }

      if (!completedRows || completedRows.length === 0) {
        // no completed lessons yet
        return 0;
      }

      const completedLessonIds = completedRows.map((r) => r.lesson_id).filter(Boolean);
      if (completedLessonIds.length === 0) return 0;

      // fetch vocab_count for those lesson_ids from lesson_vocab_count
      const { data: countsData, error: countsErr } = await supabase
        .from("lesson_vocab_count")
        .select("lesson_id, vocab_count")
        .in("lesson_id", completedLessonIds);

      if (countsErr) {
        console.warn("computeVocab: failed to read lesson_vocab_count:", countsErr.message ?? countsErr);
        return null;
      }

      const total = (countsData || []).reduce((acc, r) => acc + Number(r.vocab_count || 0), 0);

      // persist and update UI/cache
      cached.current.vocabCached = total;
      await AsyncStorage.setItem(STORAGE_KEYS.VOCAB_COUNT, String(total));
      setStats((s) => ({ ...s, vocab: total }));
      return total;
    } catch (err) {
      console.warn("computeVocabFromCompletedLessons error:", err?.message ?? err);
      return null;
    }
  }

  // --- Vocab modal (kept from your original) ---
  async function openVocabModal() {
    setVocabModalVisible(true);
    setLearnedLoading(true);

    ensureVocabCountAvailable().catch(() => {});

    const local = await vocabProgress.getLocalLearnedList();
    if (local && local.length > 0) {
      setLearnedList(local);
      setLearnedLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLearnedLoading(false);
        return;
      }
      const userId = user.id;
      const { data, error } = await supabase
        .from("user_vocab")
        .select("learned_at, source_lesson_key, vocab: vocab(vocab, pinyin, translation)")
        .eq("user_id", userId)
        .order("learned_at", { ascending: false });

      if (error) throw error;

      const list = (data || []).map((r) => {
        const v = r.vocab || {};
        return {
          vocab: v.vocab || "",
          pinyin: v.pinyin || "",
          translation: v.translation || "",
          learned_at: r.learned_at,
          source_lesson_key: r.source_lesson_key,
        };
      });

      setLearnedList(list);
      await AsyncStorage.setItem(STORAGE_KEYS.VOCAB_LEARNED_LIST, JSON.stringify(list));
      await AsyncStorage.setItem(STORAGE_KEYS.VOCAB_LEARNED_COUNT, String(list.length));
    } catch (err) {
      console.warn("openVocabModal error:", err?.message ?? err);
    } finally {
      setLearnedLoading(false);
    }
  }

  // ensure vocab count is available: prefer computed from completed lessons, else local cache, else server sum
  async function ensureVocabCountAvailable() {
    try {
      if (cached.current.vocabCached != null) return cached.current.vocabCached;

      const local = await AsyncStorage.getItem(STORAGE_KEYS.VOCAB_COUNT);
      if (local != null) {
        cached.current.vocabCached = Number(local);
        setStats((s) => ({ ...s, vocab: Number(local) }));
        return cached.current.vocabCached;
      }

      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) return 0;
      const computed = await computeVocabFromCompletedLessons(user.id);
      if (computed != null) return computed;

      // last resort: sum entire lesson_vocab_count table (counts all lessons)
      const { data: allData, error: allErr } = await supabase
        .from("lesson_vocab_count")
        .select("vocab_count");
      if (!allErr) {
        const total = (allData || []).reduce((acc, r) => acc + Number(r.vocab_count || 0), 0);
        cached.current.vocabCached = total;
        await AsyncStorage.setItem(STORAGE_KEYS.VOCAB_COUNT, String(total));
        setStats((s) => ({ ...s, vocab: total }));
        return total;
      }

      return 0;
    } catch (err) {
      console.warn("ensureVocabCountAvailable error", err?.message ?? err);
      return cached.current.vocabCached ?? 0;
    }
  }

  
  return (
    <View style={styles.container}>
      
      <SimpleLineChart labels={chartData.labels} data={chartData.minutes} userId={null} />

      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={openVocabModal}>
          <Text style={styles.cardValue}>{stats.vocab}</Text>
          <Text style={styles.cardTitle}>Total Vocab Learned</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} >
          <Text style={styles.cardValue}>{stats.timeSpent}</Text>
          <Text style={styles.cardTitle}>Time Spent (mins)</Text>
        </TouchableOpacity>


        <View style={styles.card}>
          <Text style={styles.cardValue}>{stats.lessons}</Text>
          <Text style={styles.cardTitle}>Lessons Completed</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardValue}>{stats.chapters}</Text>
          <Text style={styles.cardTitle}>Chapters Completed</Text>
        </View>
      </View>

      <Modal visible={vocabModalVisible} animationType="slide" onRequestClose={() => setVocabModalVisible(false)}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Vocab You Learned ({learnedList.length})</Text>
            <TouchableOpacity onPress={() => setVocabModalVisible(false)}>
              <Text style={modalStyles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          {learnedLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <ScrollView style={{ padding: 12 }}>
              {learnedList.length === 0 ? (
                <Text style={{ textAlign: "center", marginTop: 20 }}>No learned vocab yet.</Text>
              ) : (
                learnedList.map((item, idx) => (
                  <View key={`${item.vocab}_${idx}`} style={modalStyles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={modalStyles.vocab}>{item.vocab}</Text>
                      <Text style={modalStyles.pinyin}>{item.pinyin}</Text>
                    </View>
                    <Text style={modalStyles.translation}>{item.translation}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}



const modalStyles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "700" },
  close: { color: "#2280b0", fontWeight: "700" },
  row: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    alignItems: "center",
  },
  vocab: { fontSize: 16, fontWeight: "700" },
  pinyin: { fontSize: 12, color: "#666", marginTop: 2 },
  translation: { marginLeft: 12, fontSize: 14, color: "#444" },
});

const styles = StyleSheet.create({
 
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 14, // slightly larger to ensure cards don't overlap x-axis labels
    paddingBottom: 8,
  },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2280b0",
  },
  cardTitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#555",
    textAlign: "center",
  },
});
