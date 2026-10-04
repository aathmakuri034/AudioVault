import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button, TextField } from '@/components/ui';
import { PLAYLIST_NAME_MAX } from '@/services/database/repositories/playlistsRepository';
import { useLibraryStore } from '@/store/libraryStore';
import { colors, spacing } from '@/theme';

import { createPlaylist, updatePlaylist } from '../playlistActions';

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give your playlist a name.')
    .max(PLAYLIST_NAME_MAX, `Use ${PLAYLIST_NAME_MAX} characters or fewer.`),
  description: z.string().trim().max(300, 'Use 300 characters or fewer.'),
});

/**
 * Create Playlist, and Rename/Edit when an `id` is passed. An optional
 * `addSongId` adds that song right after creating (from "Add to playlist").
 */
export function PlaylistEditScreen() {
  const { id, addSongId } = useLocalSearchParams<{ id?: string; addSongId?: string }>();
  const existing = useLibraryStore((s) => (id ? s.playlists.find((p) => p.id === id) : undefined));
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = formSchema.safeParse({ name, description });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the playlist details.');
      return;
    }
    setSaving(true);
    try {
      const values = { name: parsed.data.name, description: parsed.data.description || null };
      if (existing) {
        await updatePlaylist(existing.id, values);
        router.back();
      } else {
        const created = await createPlaylist({ ...values, initialSongId: addSongId });
        router.dismiss();
        if (!addSongId) router.push({ pathname: '/playlist/[id]', params: { id: created.id } });
      }
    } catch {
      Alert.alert('Could not save playlist', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: existing ? 'Edit Playlist' : 'New Playlist' }} />
      <TextField
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        placeholder="My playlist"
        autoFocus
        maxLength={PLAYLIST_NAME_MAX}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        error={error}
      />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What's it for?"
        maxLength={300}
        multiline
      />
      <Button
        label={existing ? 'Save' : 'Create Playlist'}
        onPress={() => void save()}
        loading={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
});
