// App entry point. The playback service is registered here, outside the React
// component tree, before Expo Router mounts any screen.
import { registerPlaybackService } from './src/services/audio/playbackService';

registerPlaybackService();

// eslint-disable-next-line import/first
import 'expo-router/entry';
