import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Card, Chip, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { createDrawerNavigator } from '@react-navigation/drawer';

const screenWidth = Dimensions.get('window').width;
const Drawer = createDrawerNavigator(); 

// --- FAQ Data ---
const faqData = [
  { id: '1', question: '什么时候用“了”？', answer: '“了”用来表示动作完成或情况变化。', tags: ['#文法', '#初级'] },
  { id: '2', question: '怎么区分“会”和“能”？', answer: '“会”表示技能或学会，“能”表示能力或条件。', tags: ['#文法', '#中级'] },
  { id: '3', question: 'HSK3需要掌握多少个单词？', answer: '大约600个。', tags: ['#考试', '#HSK'] },
];

// --- Categories ---
const categories = ['#文法', '#词汇', '#发音', '#HSK', '#文化', '#日常会话'];

// --- QAScreen ---
function QAScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered live
  const filteredData = faqData.filter(item =>
    item.question.includes(searchQuery) ||
    item.answer.includes(searchQuery) ||
    item.tags.some(tag => tag.includes(searchQuery))
  );

  const renderFAQ = ({ item }) => {
    // Highlight tags that match search query
    const highlightedTags = item.tags.map(tag => ({
      text: tag,
      highlight: searchQuery && tag.includes(searchQuery)
    }));

    return (
      <Card style={styles.card}>
        <Card.Title title={item.question} titleNumberOfLines={2} />
        <Card.Content>
          <Text style={styles.answer}>{item.answer}</Text>
          <View style={styles.tagContainer}>
            {highlightedTags.map((tagObj, idx) => (
              <Chip
                key={idx}
                style={[styles.tag, tagObj.highlight && styles.highlightTag]}
              >
                {tagObj.text}
              </Chip>
            ))}
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <Ionicons name="menu" size={28} color="#7b4eff" style={{ marginRight: 10 }} />
        </TouchableOpacity>
        <Searchbar
          placeholder="搜索问题、答案或标签..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={{ flex: 1 }}
        />
      </View>

      {/* FAQ List */}
      <FlatList
        data={filteredData}
        keyExtractor={item => item.id}
        renderItem={renderFAQ}
        contentContainerStyle={{ padding: 10 }}
      />
    </View>
  );
}

// --- QACategories ---
function QACategories() {
  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={styles.categoryTitle}>分类</Text>
      {categories.map((cat, idx) => (
        <TouchableOpacity key={idx} style={styles.categoryBtn}>
          <Text style={styles.categoryText}>{cat}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// --- Drawer Navigator ---
export default function QADrawer() {
  return (
    <Drawer.Navigator
      screenOptions={{
        drawerStyle: { width: screenWidth * 0.6 },
        headerShown: true,
      }}
    >
      <Drawer.Screen name="QAMain" component={QAScreen} options={{ title: '问答' }} />
      <Drawer.Screen name="分类" component={QACategories} />
    </Drawer.Navigator>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  card: {
    marginBottom: 8,
    borderRadius: 10,
    elevation: 2,
  },
  answer: {
    color: '#555',
    fontSize: 14,
    marginVertical: 4,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  tag: {
    marginRight: 6,
    marginTop: 4,
    backgroundColor: '#f0e6ff',
  },
  highlightTag: {
    backgroundColor: '#ffd700',
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  categoryBtn: {
    paddingVertical: 10,
  },
  categoryText: {
    fontSize: 16,
  },
});
