import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';

export default function SignUpScreen({ navigation }) {
  const { signUp, signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    try {
      const { user, session, error } = await signUp(email, password);

      if (error) {
       console.error('Supabase signUp error:', error);
        alert('Sign up failed: ' + error.message);
        return;
      }

      if (!session) {
        // Temporarily ignore auto sign-in
       alert('Sign up successful! Please confirm your email before signing in.');
       navigation.navigate('SignIn');
        return;
      }

    // If session exists (auto-login)
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
  } catch (err) {
    console.error('SignUpScreen handleSignUp error:', err);
    alert('Sign up failed: ' + err.message || err);
  } finally {
    setLoading(false);
  }
};


  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        Create Account
      </Text>

      <TextInput
        label="Email"
        mode="outlined"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
      />
      <TextInput
        label="Password"
        mode="outlined"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <Button 
        mode="contained" 
        onPress={handleSignUp} 
        loading={loading} 
        style={styles.button}
      >
        Sign Up
      </Button>

      <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { marginBottom: 24, textAlign: 'center' },
  input: { marginBottom: 16 },
  button: { marginBottom: 12 },
  link: { marginTop: 16, textAlign: 'center', color: '#7b4eff' },
});
