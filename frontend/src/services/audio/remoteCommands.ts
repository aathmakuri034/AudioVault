import { RemoteCommandsModule } from '@modules/audiovault-remote-commands';

import type { RemoteCommand } from './engine';

/** Whether system next/previous buttons are available on this platform build. */
export const remoteNavigationSupported = RemoteCommandsModule != null;

export function setRemoteNavigationEnabled(canGoNext: boolean, canGoPrevious: boolean) {
  RemoteCommandsModule?.enable(canGoNext, canGoPrevious);
}

export function disableRemoteNavigation() {
  RemoteCommandsModule?.disable();
}

/** Subscribes to Lock Screen / Control Center / headset next & previous. */
export function addRemoteNavigationListener(listener: (command: RemoteCommand) => void) {
  if (!RemoteCommandsModule) return () => {};
  const next = RemoteCommandsModule.addListener('onRemoteNext', () => listener('next'));
  const previous = RemoteCommandsModule.addListener('onRemotePrevious', () => listener('previous'));
  return () => {
    next.remove();
    previous.remove();
  };
}
