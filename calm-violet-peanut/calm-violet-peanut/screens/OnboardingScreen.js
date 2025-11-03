// OnboardingScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, BackHandler, Alert, Platform } from 'react-native';
import { Text, Button, Chip, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { CommonActions, useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';

const TOTAL_STEPS = 3;

export default function OnboardingScreen() {
  const { user, setProfile } = useAuth();
  const navigation = useNavigation();

  const [step, setStep] = useState(1);
  const [level, setLevel] = useState('');
  const [reasons, setReasons] = useState([]);
  const [studyTime, setStudyTime] = useState(null);

  const [saving, setSaving] = useState(false);

  // Always start at step 1 when screen mounts (restart onboarding if app closed)
  useEffect(() => {
    setStep(1);
    setLevel('');
    setReasons([]);
    setStudyTime(null);
  }, []);

  // Disable Android hardware back button while on onboarding
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true; // consume event (disable back)
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => {
        // remove subscription safely
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        } else if (Platform.OS === 'android' && BackHandler.removeEventListener) {
          // fallback if older RN - defensive
          BackHandler.removeEventListener('hardwareBackPress', onBackPress);
        }
      };
    }, [])
  );

  const toggleReason = (reason) => {
    setReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleNext = async () => {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'No user found. Please sign in again.');
      return;
    }

    // Finalize onboarding
    try {
      setSaving(true);

      const updates = {
        onboarding_completed: true,
        level: level || null,
        reasons: reasons.length ? reasons : null, // null if empty
        studytime: studyTime ? Number(studyTime) : null, // NOTE: studytime lowercase to match DB
      };

      // Update and return the updated profile row
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Supabase update error:', error);
        Alert.alert('Save failed', error.message || 'Failed to save onboarding. Try again.');
        return;
      }

      // Update local AuthContext profile with returned row
      if (data) {
        setProfile(data);
      }

      // Reset navigation to MainApp (no back to onboarding)
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'MainApp' }],
        })
      );
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const isNextDisabled = () => {
    if (step === 1 && !level) return true;
    if (step === 2 && reasons.length === 0) return true;
    if (step === 3 && !studyTime) return true;
    return false;
  };

  const renderOptions = (options, selected, onPress, multiple = false, labelFormatter = (x) => x) =>
    options.map((opt) => (
      <Chip
        key={opt}
        style={{ margin: 4 }}
        selected={multiple ? selected.includes(opt) : selected === opt}
        onPress={() => onPress(opt)}
      >
        {labelFormatter(opt)}
      </Chip>
    ));

  const getStepTitle = () => {
    if (step === 1) return 'Select Your Current Level';
    if (step === 2) return 'Why do you want to learn Chinese?';
    if (step === 3) return 'Set Your Daily Study';
    return '';
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text variant="titleMedium" style={{ marginBottom: 10 }}>
        Step {step} of {TOTAL_STEPS}
      </Text>

      <Text variant="headlineMedium" style={{ marginBottom: 20, fontWeight: 'bold' }}>
        {getStepTitle()}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {step === 1 &&
          renderOptions(['Zero Knowledge', 'Beginner', 'Intermediate', 'Advanced'], level, setLevel)}
        {step === 2 &&
          renderOptions(
            ['Travel', 'Career', 'Culture', 'Personal Interest'],
            reasons,
            toggleReason,
            true
          )}
        {step === 3 &&
          renderOptions(['15', '30', '45'], studyTime, setStudyTime, false, (t) => `${t} min`)}
      </View>

      {saving ? (
        <ActivityIndicator animating size="large" style={{ marginTop: 30 }} />
      ) : (
        <Button mode="contained" onPress={handleNext} disabled={isNextDisabled()} style={{ marginTop: 30 }}>
          {step < TOTAL_STEPS ? 'Next' : 'Finish'}
        </Button>
      )}
    </SafeAreaView>
  );
}
