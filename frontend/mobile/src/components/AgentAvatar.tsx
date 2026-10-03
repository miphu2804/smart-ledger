import React from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export type AgentEmotion =
  | 'default'
  | 'happy'
  | 'idea'
  | 'excited'
  | 'question'
  | 'sorry'
  | 'thanks'
  | 'wink'
  | 'holding_tablet';

const EMOTION_ASSETS: Record<string, ImageSourcePropType> = {
  default: require('../../assets/voice/agent-default.png'),
  happy: require('../../assets/voice/agent-happy.png'),
  idea: require('../../assets/voice/agent-idea.png'),
  excited: require('../../assets/voice/agent-idea.png'),
  question: require('../../assets/voice/agent-question.png'),
  sorry: require('../../assets/voice/agent-sorry.png'),
  thanks: require('../../assets/voice/agent-thanks.png'),
  wink: require('../../assets/voice/agent-wink.png'),
  holding_tablet: require('../../assets/voice/agent-default.png'),
};

export function AgentAvatar({
  emotion = 'default',
  size = 44,
  badge = false,
  style,
}: {
  emotion?: AgentEmotion;
  size?: number;
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const source = EMOTION_ASSETS[emotion] ?? EMOTION_ASSETS.default;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size },
        badge && styles.badge,
        style,
      ]}
    >
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 999,
    backgroundColor: 'rgba(72, 42, 172, 0.08)',
    padding: 2,
  },
});
