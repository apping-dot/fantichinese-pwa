import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';

export default function SignInScreen({ navigation }) {
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSignIn = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      await signIn(email, password);
      // ✅ RootNavigator will route to MainApp or Onboarding depending on profile
    } catch (error) {
      console.error('Sign in failed:', error.message);

      if (error.message.includes('Invalid login credentials')) {
        setErrorMessage("We couldn't find your account. ");
      } else {
        setErrorMessage(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      // ✅ RootNavigator will handle the rest
    } catch (error) {
      console.error('Google sign-in failed:', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        Welcome Back
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

      {/* Error message */}
      {errorMessage ? (
        <Text style={styles.errorText}>
          {errorMessage}
          {errorMessage.includes("We couldn't find your account") && (
            <Text
              style={styles.signUpLink}
              onPress={() => navigation.navigate('SignUp')}
            >
              Sign up instead?
            </Text>
          )}
        </Text>
      ) : null}

      <Button
        mode="contained"
        onPress={handleSignIn}
        loading={loading}
        style={styles.button}
      >
        Sign In
      </Button>

      <Button 
        mode="outlined" 
        onPress={handleGoogleSignIn} 
        style={styles.button}
      >
        Continue with Google
      </Button>

      <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
        <Text style={styles.link}>Not a user yet? Sign up</Text>
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
  errorText: { color: 'red', fontSize: 12, marginBottom: 8 },
  signUpLink: { color: '#7b4eff', textDecorationLine: 'underline' },
});
