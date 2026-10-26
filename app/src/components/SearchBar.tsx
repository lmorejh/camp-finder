import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, shadow } from '../theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onCancel?: () => void;
  focused: boolean;
}

export function SearchBar({ value, onChangeText, onFocus, onCancel, focused }: Props) {
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
      {focused ? (
        <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="검색 닫기">
          <Ionicons name="chevron-back" size={20} color={colors.inkSoft} />
        </Pressable>
      ) : (
        <Ionicons name="search-outline" size={18} color={colors.muted} />
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder="캠핑장, 지역, 계곡·바다·글램핑 검색"
        placeholderTextColor={colors.muted}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel="캠핑장 검색"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="검색어 지우기">
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  wrapFocused: { borderWidth: 1.5, borderColor: colors.primary },
  input: { flex: 1, fontSize: 16, letterSpacing: -0.2, color: colors.ink, paddingVertical: 0 },
});
