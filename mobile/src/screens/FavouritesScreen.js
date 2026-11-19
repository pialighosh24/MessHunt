import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { getFavourites, removeFavourite } from '../services/studentService';
import AccommodationCard from '../components/AccommodationCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

export default function FavouritesScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const data = await getFavourites();
      setItems(Array.isArray(data?.favourites) ? data.favourites : []);
    } catch (e) {
      setError(e?.message || 'Failed to load favourites.');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRemove = async (id) => {
    setRemovingId(id);
    try {
      await removeFavourite(id);
      setItems((prev) => prev.filter((x) => String(x.id) !== String(id)));
    } catch (e) {
      setError(e?.message || 'Could not remove favourite.');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading && items.length === 0 && !error) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color={colors.primaryNavy} /><Text style={styles.muted}>Loading favourites...</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primaryNavy]} />}
        ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>Favourites</Text><Text style={styles.subtitle}>Your saved accommodations (approved & available).</Text></View>}
        renderItem={({ item }) => (
          <View>
            <AccommodationCard item={item} onPress={() => navigation.navigate('AccommodationDetail', { id: item.id })} />
            <Pressable style={styles.removeBtn} onPress={() => onRemove(item.id)} disabled={removingId === item.id}>
              <Text style={styles.removeText}>{removingId === item.id ? 'Removing...' : 'Remove from favourites'}</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={!error ? <EmptyState title="No favourites yet" message="Save accommodations you like to find them quickly here." actionLabel="Browse accommodations" onAction={() => navigation.navigate('HomeTab')} /> : null}
        ListFooterComponent={error ? <ErrorState message={error} onRetry={() => load()} /> : <View style={{ height: 16 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.warmWhite },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warmWhite },
  list: { padding: 16, paddingBottom: 24 },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.primaryNavy },
  subtitle: { fontSize: 13, color: colors.mutedText, marginTop: 4 },
  muted: { color: colors.mutedText, marginTop: 8 },
  removeBtn: { alignSelf: 'flex-start', marginTop: -4, marginBottom: 12, paddingHorizontal: 10, paddingVertical: 6 },
  removeText: { color: colors.error, fontWeight: '600', fontSize: 13 },
});
