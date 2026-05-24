import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

const { height } = Dimensions.get('window');
const welcomeImage = require('../assets/images/welcome.png');

export default function WelcomeScreen() {
  const { loaded, token } = useAuth();
  const eyebrowAnim = useRef(new Animated.Value(0)).current;
  const titleAnim   = useRef(new Animated.Value(0)).current;
  const cardAnim    = useRef(new Animated.Value(0)).current;
  const btnAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(140, [
      Animated.spring(eyebrowAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.spring(titleAnim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.spring(cardAnim,    { toValue: 1, useNativeDriver: true, tension: 50, friction: 9 }),
      Animated.spring(btnAnim,     { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
    ]).start();
  }, [eyebrowAnim, titleAnim, cardAnim, btnAnim]);

  useEffect(() => {
    if (loaded && token) router.replace('/(tabs)/home');
  }, [loaded, token]);

  const fadeSlide = (anim: Animated.Value, offsetY = 24) => ({
    opacity: anim,
    transform: [{
      translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [offsetY, 0] }),
    }],
  });

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: Tokens.bg,
        paddingHorizontal: 24,
        paddingTop: 88,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="light-content" backgroundColor={Tokens.bg} />

      <Animated.View style={fadeSlide(eyebrowAnim, 12)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 18, height: 1, backgroundColor: Tokens.accent }} />
          <Eyebrow tone="accent">Document scanner</Eyebrow>
        </View>
      </Animated.View>

      <Animated.View style={[{ marginTop: 18, marginBottom: 28 }, fadeSlide(titleAnim, 16)]}>
        <Text
          style={{
            color: Tokens.ink,
            fontFamily: 'PlusJakartaSans_700Bold',
            fontSize: 44,
            lineHeight: 48,
            letterSpacing: -1,
          }}
        >
          Capture pages.{'\n'}
          <Text style={{ color: Tokens.accent }}>Read the words.</Text>
        </Text>
        <Text
          style={{
            color: Tokens.inkMuted,
            fontFamily: 'PlusJakartaSans_400Regular',
            fontSize: 15,
            lineHeight: 22,
            marginTop: 14,
            maxWidth: 320,
          }}
        >
          On-device OCR with scanner-grade enhancement. Every scan
          synchronises across your devices.
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          {
            width: '100%',
            height: height * 0.34,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: Tokens.hairline,
            backgroundColor: Tokens.surface,
            marginBottom: 28,
          },
          fadeSlide(cardAnim, 40),
        ]}
      >
        <Image
          source={welcomeImage}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </Animated.View>

      <Animated.View style={[{ width: '100%', gap: 12 }, fadeSlide(btnAnim, 20)]}>
        <Button
          label="Sign in"
          variant="primary"
          onPress={() => router.push({ pathname: '/sign-in' })}
          trailing={<Ionicons name="arrow-forward" size={18} color={Tokens.accentInk} />}
        />
        <Button
          label="Create account"
          variant="secondary"
          onPress={() => router.push({ pathname: '/sign-up' })}
        />
      </Animated.View>
    </ScrollView>
  );
}
