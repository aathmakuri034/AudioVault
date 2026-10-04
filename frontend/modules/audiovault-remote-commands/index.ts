import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

type RemoteCommandEvents = {
  onRemoteNext: () => void;
  onRemotePrevious: () => void;
};

type NativeRemoteCommands = {
  /** Registers next/previous handlers and sets whether each button is enabled. */
  enable(canGoNext: boolean, canGoPrevious: boolean): void;
  /** Unregisters handlers and hides the buttons. */
  disable(): void;
  addListener<E extends keyof RemoteCommandEvents>(
    event: E,
    listener: RemoteCommandEvents[E],
  ): EventSubscription;
};

/**
 * Native module, or null where it isn't compiled in (Android, Jest, Expo Go).
 * Callers must treat next/previous remote controls as unavailable then.
 */
export const RemoteCommandsModule =
  requireOptionalNativeModule<NativeRemoteCommands>('AudioVaultRemoteCommands');
