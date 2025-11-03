import React, { useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAPTER_LESSONS_CACHE_PREFIX = 'chapter.lessons.v1.'; // + chapter_no
const COMPLETED_KEY = 'lesson.completed.v1';

export default function ChapterScreen({ route, navigation }) {
  const chapter_no = route.params?.chapter_no;
  const chapter_title = route.params?.chapter_title ?? `Chapter ${chapter_no}`;
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completedMap, setCompletedMap] = useState({});

  useEffect(() => {
    navigation.setOptions({ title: chapter_title });
  }, [chapter_title, navigation]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const cacheKey = `${CHAPTER_LESSONS_CACHE_PREFIX}${chapter_no}`;
      try {
        // try cache first
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && mounted) {
          setLessons(JSON.parse(cached));
        }

        // fetch fresh from Supabase
        const { data, error } = await supabase
         .from('lesson_meta')   // <- use the view instead of the table
         .select('*')
         .eq('chapter_no', Number(chapter_no))
         .order('lesson_no', { ascending: true });

        if (error) {
          console.warn('Failed to fetch chapter lessons:', error);
          setLoading(false);
          return;
        }

        if (mounted) {
          setLessons(data || []);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
        }
      } catch (e) {
        console.warn('Chapter fetch error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // load completed map from AsyncStorage or Supabase
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(COMPLETED_KEY);
        if (saved) {
          setCompletedMap(JSON.parse(saved));
        } else {
          // attempt to fetch completed from Supabase (if user logged in)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: rows } = await supabase
              .from('lesson_progress')
              .select('lesson_id, completed')
              .eq('user_id', user.id);
            const map = {};
            rows?.forEach((r) => {
              map[String(r.lesson_id)] = !!r.completed;
            });
            setCompletedMap(map);
            await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
          }
        }
      } catch (e) {
        console.warn('Failed to load completed map:', e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [chapter_no, navigation]);

  // Helper function to render the lesson card
  const renderLessonCard = ({ item }) => {
    const numericLessonKey = String(item.lesson_no);
    const compositeLessonKey = `Ch${item.chapter_no}_L${item.lesson_no}`;

    const isCompleted = !!completedMap[numericLessonKey] || !!completedMap[compositeLessonKey];

    return (
      <TouchableOpacity
        style={[styles.card, isDark && styles.cardDark]}
        onPress={() =>
          navigation.navigate('Lesson', {
            chapter_no: item.chapter_no,
            lesson_no: item.lesson_no,
          })
        }
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isDark && styles.textLight]}>{item.lesson_title}</Text>
          <Text style={[styles.subtitle, isDark && styles.textMuted]}>
            {item.lesson_title_translation}
          </Text>
        </View>

        {isCompleted && <Ionicons name="checkmark-circle" size={24} color="#4caf50" />}
      </TouchableOpacity>
    );
  };

  if (loading && lessons.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7b4eff" />
        <Text style={{ marginTop: 8 }}>Loading lessons...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        data={lessons}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderLessonCard} // Use the local render function here
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerDark: { backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardDark: {
    backgroundColor: '#1e1e1e',
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666' },
  textLight: { color: '#fff' },
  textMuted: { color: '#bbb' },
});
