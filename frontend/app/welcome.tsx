import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  Image,
  ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');
const welcomeImage = require('../assets/images/welcome.png');

export default function WelcomeScreen() {
  const logoAnim  = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim  = useRef(new Animated.Value(0)).current;
  const btnAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(140, [
      Animated.spring(logoAnim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.spring(titleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.spring(cardAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 9 }),
      Animated.spring(btnAnim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
    ]).start();
  }, []);

  const fadeSlide = (anim: Animated.Value, offsetY = 24) => ({
    opacity: anim,
    transform: [{
      translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [offsetY, 0] }),
    }],
  });

  const logoScale = {
    opacity: logoAnim,
    transform: [{
      scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
    }],
  };

  return (
    <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F4F1E8" />

      <Animated.View style={[styles.logoWrapper, logoScale]}>
        <View style={styles.logoBox}>
          <Ionicons name="document-text" size={65} color="#0F5C4D" />
        </View>
      </Animated.View>

      <Animated.View style={[styles.titleWrapper, fadeSlide(titleAnim, 16)]}>
        <Text style={styles.title}>ClassicScan</Text>
        <Text style={styles.subtitle}>Scan, Enhance, Extract</Text>
      </Animated.View>

      <Animated.View style={[styles.heroCard, fadeSlide(cardAnim, 40)]}>
          <Image
            source={welcomeImage}
            style={styles.heroImage}
            resizeMode="cover"
          />
      </Animated.View>

      <Animated.View style={[styles.btnWrapper, fadeSlide(btnAnim, 20)]}>
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={() => router.replace('/(tabs)/home')}
        >
          <Text style={styles.ctaText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F4F1E8',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
  },

  logoWrapper: {
    marginBottom: 55,
  },
  logoBox: {
    width: 130,
    height: 130,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  titleWrapper: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 45,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    color: '#888',
    letterSpacing: 0.3,
  },

  heroImage: {
    width: '100%',
    height: '100%',
  }, 
  heroCard: {
    width: '100%',
    height: 900,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 36,
    shadowColor: '#0F5C4D',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  btnWrapper: {
    width: '100%',
  },
  ctaButton: {
    width: '100%',
    height: 58,
    backgroundColor: '#0F5C4D',
    borderRadius: 29,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#0F5C4D',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});