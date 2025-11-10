// SettingsContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SettingsContext = createContext(null);

// defaults: pinyin ON, translation ON
const DEFAULTS = { showPinyin: true, showTranslation: true };
const STORAGE_KEY = 'app.settings.v1';

export function SettingsProvider({ children }) {
  const [showPinyin, setShowPinyin] = useState(DEFAULTS.showPinyin);
  const [showTranslation, setShowTranslation] = useState(DEFAULTS.showTranslation);

  // load saved settings on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.showPinyin === 'boolean') setShowPinyin(parsed.showPinyin);
          if (typeof parsed.showTranslation === 'boolean') setShowTranslation(parsed.showTranslation);
        }
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    })();
  }, []);

  // persist on change
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ showPinyin, showTranslation })
        );
      } catch (e) {
        console.warn('Failed to save settings:', e);
      }
    })();
  }, [showPinyin, showTranslation]);

  const value = useMemo(
    () => ({
      showPinyin,
      setShowPinyin,
      showTranslation,
      setShowTranslation,
    }),
    [showPinyin, showTranslation]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within <SettingsProvider>');
  return ctx;
}
