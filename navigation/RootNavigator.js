import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import WelcomeScreen from '../screens/WelcomeScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import MainApp from '../screens/MainApp';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, profile, loading } = useAuth();
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return null; // or a loading splash

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {showWelcome ? (
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
      ) : !user ? (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
        </>
      ) : profile?.onboarding_completed ? (
        <Stack.Screen name="MainApp" component={MainApp} />
      ) : (
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ gestureEnabled: false }} // prevent swipe back
        />
      )}
    </Stack.Navigator>
  );
}
