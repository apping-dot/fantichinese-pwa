import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';

export default function WelcomeScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('AuthOrMain'); 
      // "AuthOrMain" is your root navigator that decides:
      //   - If user not signed in → SignIn
      //   - If signed in → MainApp or Onboarding
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        欢迎学习中文！
      </Text>
      <ActivityIndicator animating={true} size="large" />
      <Text style={styles.subtitle}>Loading your app...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { marginBottom: 20, textAlign: 'center' },
  subtitle: { marginTop: 16, textAlign: 'center', color: '#555' },
});
