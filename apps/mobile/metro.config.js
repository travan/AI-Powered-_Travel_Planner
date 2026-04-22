/**
 * Metro configuration for Expo Router
 * Ensures EXPO_ROUTER_APP_ROOT is available at transform time
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

// Ensure env var is set before Metro initializes
// This is critical for expo-router to properly transform require.context()
process.env.EXPO_ROUTER_APP_ROOT ??= 'app';

const config = getDefaultConfig(__dirname);

config.resolver = {
	...config.resolver,
	extraNodeModules: {
		...(config.resolver?.extraNodeModules ?? {}),
		react: path.resolve(__dirname, 'node_modules/react'),
		'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
	},
};

module.exports = config;
