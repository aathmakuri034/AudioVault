import { useCallback, useState } from 'react';

import type { Song } from '@/types/models';

/**
 * State for a song's three-dot menu. The song stays set while the sheet
 * animates out (visible=false) and is cleared once dismissed, so the sheet
 * can finish its animation and run follow-up actions safely.
 */
export function useSongMenu() {
  const [song, setSong] = useState<Song | null>(null);
  const [visible, setVisible] = useState(false);

  const open = useCallback((s: Song) => {
    setSong(s);
    setVisible(true);
  }, []);

  return {
    open,
    sheetProps: {
      song,
      visible,
      onClose: () => setVisible(false),
      onDismissed: () => setSong(null),
    },
  };
}
