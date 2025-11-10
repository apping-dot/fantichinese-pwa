import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LessonListScreen from '../screens/LessonListScreen';
import LessonScreen from '../screens/LessonScreen';

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

const CHAPTERS_CACHE_KEY = 'chapters.v1';

function LessonsDrawerScreen() {
  const [chapters, setChapters] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Load cache first
        const cached = await AsyncStorage.getItem(CHAPTERS_CACHE_KEY);
        if (cached && mounted) {
          setChapters(JSON.parse(cached));
        }

        // Fetch latest chapters from Supabase
        const { data, error } = await supabase
          .from('lessons')
          .select('chapter_no, chapter_title')
          .order('chapter_no', { ascending: true });

        if (error) throw error;

        // Deduplicate and sort
        const map = new Map();
        (data || []).forEach((row) => {
          if (row?.chapter_no != null && !map.has(row.chapter_no)) {
            map.set(row.chapter_no, {
              chapter_no: row.chapter_no,
              chapter_title: row.chapter_title || `Chapter ${row.chapter_no}`,
            });
          }
        });

        const list = Array.from(map.values()).sort(
          (a, b) => a.chapter_no - b.chapter_no
        );

        if (mounted) {
          setChapters(list);
          await AsyncStorage.setItem(CHAPTERS_CACHE_KEY, JSON.stringify(list));
        }
      } catch {
        // If fetch fails, keep cached chapters (if any)
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading && !chapters) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7b4eff" />
        <Text style={{ marginTop: 8 }}>Loading chapters...</Text>
      </View>
    );
  }

  return (
    <Drawer.Navigator
      screenOptions={{
        drawerStyle: { width: '60%' },
        headerShown: true,
      }}
    >
      {/* All Lessons */}
      <Drawer.Screen
        name="All Lessons"
        component={LessonListScreen}
        options={{
          drawerLabel: () => (
            <Text style={{ fontWeight: '700', paddingLeft: 8 }}>All Lessons</Text>
          ),
        }}
      />

      {/* Per-Chapter Drawer Entries */}
      {(Array.isArray(chapters) ? chapters : []).map((ch) => (
        <Drawer.Screen
          key={`chapter-${ch.chapter_no}`}
          name={`Chapter ${ch.chapter_no}: ${ch.chapter_title}`}
          component={LessonListScreen}
          initialParams={{
            chapter_no: ch.chapter_no,
            chapter_title: ch.chapter_title,
          }}
          options={{
            drawerLabel: ch.chapter_title,
            headerTitle: ch.chapter_title,
          }}
        />
      ))}
    </Drawer.Navigator>
  );
}

export default function LessonsStackScreen() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="LessonsDrawer"
        component={LessonsDrawerScreen}
        options={{ headerShown: false }}
      />

      {/* Chapter route now uses LessonListScreen */}
      <Stack.Screen
        name="Chapter"
        component={LessonListScreen}
        options={({ route }) => ({
          title: route?.params?.chapter_title ?? 'Chapter',
        })}
      />

      <Stack.Screen
        name="Lesson"
        component={LessonScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}


const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
