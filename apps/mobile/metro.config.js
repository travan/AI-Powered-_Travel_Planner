/**
 * Metro configuration for Expo Router
 * Ensures EXPO_ROUTER_APP_ROOT is available at transform time
 */

const { getDefaultConfig } = require('expo/metro-config');

// Ensure env var is set before Metro initializes
// This is critical for expo-router to properly transform require.context()
process.env.EXPO_ROUTER_APP_ROOT ??= 'app';

const config = getDefaultConfig(__dirname);

module.exports = config;
