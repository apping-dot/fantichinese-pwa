import { View, Text, Switch, ScrollView, StyleSheet } from 'react-native'; 
import { useSettings } from '../contexts/SettingsContext';

// --- SETTINGS SCREEN ---
function SettingsScreen() {
  const { showPinyin, setShowPinyin, showTranslation, setShowTranslation } = useSettings();

  const introPassage = `Name: Chew Xiu Ting 周綉婷
Email: nccu.xiuting@gmail.com

Hi! I’m Xiu Ting, a Malaysian Chinese student at NCCU. I built this app to help you learn Chinese through real-life conversations, so you can absorb grammar in context instead of studying it in isolation.

The shadowing practice helps improve your tones while you pick up useful everyday phrases naturally.

I'm currently teaching Chinese to about 10 students at our Chinese Language Center, which helps me understand what learners really need. Feel free to email me with any feedback or questions.

Most importantly, keep learning, and I hope you enjoy this app!`;

  return (
    <View style={styles.container}>
     
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* --- Toggles --- */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>显示拼音</Text>
          <Switch value={showPinyin} onValueChange={setShowPinyin} />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>显示翻译</Text>
          <Switch value={showTranslation} onValueChange={setShowTranslation} />
        </View>

        {/* --- Intro Passage --- */}
        <View style={styles.introContainer}>
          <Text style={styles.introText}>{introPassage}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleText: {
    flex: 1,
    fontSize: 16,
  },
  introContainer: {
    marginTop: 24,
  },
  introText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'justify',
  },
});

export default SettingsScreen;
