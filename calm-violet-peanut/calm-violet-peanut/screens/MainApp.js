// screens/MainApp.js
import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LessonsStackScreen from '../screens/LessonsStackScreen';
import { Ionicons } from '@expo/vector-icons';
import ProgressScreen from '../screens/ProgressScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { AppState } from 'react-native';
import vocabProgress from '../services/vocabProgress';

const Tab = createBottomTabNavigator();

export default function MainApp() {
  // AppState listener to flush pending vocab upserts when app becomes active
  useEffect(() => {
    const handleAppStateChange = (state) => {
      if (state === 'active') {
        vocabProgress.syncPendingVocabUpserts().catch(() => {});
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    // Also attempt a sync on mount (in case app started active)
    vocabProgress.syncPendingVocabUpserts().catch(() => {});

    return () => {
      // cleanup
      if (sub && typeof sub.remove === 'function') sub.remove();
    };
  }, []);

  const getTabBarVisibility = (route) => {
    const routeName = getFocusedRouteNameFromRoute(route) ?? '';
    if (routeName === 'Lesson') return 'none'; // Hide tabs inside lesson
    return 'flex';
  };

  return (
   

<Tab.Navigator
  screenOptions={({ route }) => ({
    headerShown: route.name !== 'Lessons', // hide Lessons header (stack handles it)
    tabBarStyle: { display: getTabBarVisibility(route) },
    tabBarIcon: ({ color, size }) => {
      let iconName;
      if (route.name === 'Lessons') iconName = 'book-outline';
      else if (route.name === 'Progress') iconName = 'bar-chart-outline';
      else if (route.name === 'Settings') iconName = 'settings-outline';
      return <Ionicons name={iconName} size={size} color={color} />;
    },
    // **Set Progress and Settings headers to white/black like Lessons**
    headerStyle: { backgroundColor: '#fff' }, // white background
    headerTitleStyle: { color: '#000', fontWeight: '700' }, // black text
    headerTintColor: '#000', // back button color
  })}
>
  <Tab.Screen name="Lessons" component={LessonsStackScreen}  />
  <Tab.Screen name="Progress" component={ProgressScreen} options={{ headerTitle: 'Progress' }}/>
  <Tab.Screen name="Settings" component={SettingsScreen} options={{ headerTitle: 'Settings' }}/>
</Tab.Navigator>
);
}
