import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { listPublicAccommodations } from '../services/accommodationService';
import AccommodationCard from '../components/AccommodationCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const TYPE_OPTIONS = ['', 'Mess', 'PG', 'Hostel'];
const GENDER_OPTIONS = ['', 'Boys', 'Girls', 'Co-ed'];
const ROOM_OPTIONS = ['', 'Single', 'Double', 'Shared'];
const FOOD_OPTIONS = ['', 'true', 'false'];
const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Rent ↑', value: 'rent_asc' },
  { label: 'Rent ↓', value: 'rent_desc' },
  { label: 'Top Rated', value: 'rating_desc' },
];

const INITIAL_FILTERS = {
  city: '',
  locality: '',
  accommodationType: '',
  genderType: '',
  roomType: '',
  foodProvided: '',
  minRent: '',
  maxRent: '',
  sortBy: 'newest',
};

function Chip({ label, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function StudentHomeScreen({ navigation }) {
  const { user } = useAuth();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState(INITIAL_FILTERS);
  const [items, setItems] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalResults: 0, currentPage: 1, totalPages: 0, hasNextPage: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [recentError, setRecentError] = useState('');

  const buildParams = useCallback((f, p) => {
    const params = { page: p, limit: 10, sortBy: f.sortBy || 'newest' };
    if (f.city.trim()) params.city = f.city.trim();
    if (f.locality.trim()) params.locality = f.locality.trim();
    if (f.accommodationType) params.accommodationType = f.accommodationType;
    if (f.genderType) params.genderType = f.genderType;
    if (f.roomType) params.roomType = f.roomType;
    if (f.foodProvided) params.foodProvided = f.foodProvided;
    if (f.minRent.trim()) params.minRent = f.minRent.trim();
    if (f.maxRent.trim()) params.maxRent = f.maxRent.trim();
    return params;
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      setRecentError('');
      const data = await listPublicAccommodations({ page: 1, limit: 5, sortBy: 'newest' });
      setRecentItems(Array.isArray(data.accommodations) ? data.accommodations : []);
    } catch (e) {
      setRecentError(e?.message || 'Could not load recently added listings.');
      setRecentItems([]);
    }
  }, []);

  const load = useCallback(async ({ reset = false, nextPage = 1, appliedFilters = applied, refresh = false } = {}) => {
    if (reset) setLoading(true); else if (!refresh) setLoadingMore(true);
    setError('');
    try {
      const data = await listPublicAccommodations(buildParams(appliedFilters, nextPage));
      const list = Array.isArray(data.accommodations) ? data.accommodations : [];
      setItems((prev) => (nextPage === 1 ? list : [...prev, ...list]));
      setPagination(data.pagination || { totalResults: 0, currentPage: nextPage, totalPages: 0, hasNextPage: false });
      setPage(nextPage);
    } catch (e) {
      setError(e?.message || 'Failed to load accommodations.');
      if (nextPage === 1) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [applied, buildParams]);

  useEffect(() => {
    loadRecent();
    load({ reset: true, nextPage: 1, appliedFilters: INITIAL_FILTERS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => {
    const next = { ...filters };
    setApplied(next);
    load({ reset: true, nextPage: 1, appliedFilters: next });
  };

  const onClear = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    load({ reset: true, nextPage: 1, appliedFilters: INITIAL_FILTERS });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadRecent();
    load({ reset: false, nextPage: 1, appliedFilters: applied, refresh: true });
  };

  const onLoadMore = () => {
    if (loading || loadingMore || !pagination.hasNextPage) return;
    load({ reset: false, nextPage: page + 1, appliedFilters: applied });
  };

  const header = useMemo(() => (
    <View>
      <View style={styles.heroCard}>
        <Text style={styles.brand}>Mess Hunt</Text>
        <Text style={styles.tagline}>Find Your Perfect Mess</Text>
        <Text style={styles.welcome}>Welcome{user?.name ? `, ${user.name}` : ''}</Text>
        <Text style={styles.welcomeSub}>Search approved and available accommodations from real listings.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search & Filters</Text>
        <TextInput style={styles.input} placeholder="City" placeholderTextColor={colors.mutedText} value={filters.city} onChangeText={(v) => setFilters((p) => ({ ...p, city: v }))} />
        <TextInput style={styles.input} placeholder="Locality" placeholderTextColor={colors.mutedText} value={filters.locality} onChangeText={(v) => setFilters((p) => ({ ...p, locality: v }))} />

        <Text style={styles.label}>Accommodation type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {TYPE_OPTIONS.map((opt) => <Chip key={`t-${opt||'all'}`} label={opt || 'All'} selected={filters.accommodationType === opt} onPress={() => setFilters((p)=>({ ...p, accommodationType: opt }))} />)}
        </ScrollView>

        <Text style={styles.label}>Gender</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {GENDER_OPTIONS.map((opt) => <Chip key={`g-${opt||'all'}`} label={opt || 'All'} selected={filters.genderType === opt} onPress={() => setFilters((p)=>({ ...p, genderType: opt }))} />)}
        </ScrollView>

        <Text style={styles.label}>Room type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {ROOM_OPTIONS.map((opt) => <Chip key={`r-${opt||'all'}`} label={opt || 'All'} selected={filters.roomType === opt} onPress={() => setFilters((p)=>({ ...p, roomType: opt }))} />)}
        </ScrollView>

        <Text style={styles.label}>Food availability</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Chip label="All" selected={filters.foodProvided === ''} onPress={() => setFilters((p)=>({ ...p, foodProvided: '' }))} />
          <Chip label="Food provided" selected={filters.foodProvided === 'true'} onPress={() => setFilters((p)=>({ ...p, foodProvided: 'true' }))} />
          <Chip label="No food" selected={filters.foodProvided === 'false'} onPress={() => setFilters((p)=>({ ...p, foodProvided: 'false' }))} />
        </ScrollView>

        <View style={styles.rentRow}>
          <TextInput style={[styles.input, styles.rentInput]} placeholder="Min rent" placeholderTextColor={colors.mutedText} keyboardType="numeric" value={filters.minRent} onChangeText={(v) => setFilters((p) => ({ ...p, minRent: v.replace(/[^0-9]/g, '') }))} />
          <TextInput style={[styles.input, styles.rentInput]} placeholder="Max rent" placeholderTextColor={colors.mutedText} keyboardType="numeric" value={filters.maxRent} onChangeText={(v) => setFilters((p) => ({ ...p, maxRent: v.replace(/[^0-9]/g, '') }))} />
        </View>

        <Text style={styles.label}>Sort by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {SORT_OPTIONS.map((opt) => <Chip key={opt.value} label={opt.label} selected={filters.sortBy === opt.value} onPress={() => setFilters((p)=>({ ...p, sortBy: opt.value }))} />)}
        </ScrollView>

        <View style={styles.actionsRow}>
          <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={onSearch}><Text style={styles.primaryBtnText}>Search</Text></Pressable>
          <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={onClear}><Text style={styles.secondaryBtnText}>Clear / Reset</Text></Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recently added</Text>
        {recentError ? <Text style={styles.inlineError}>{recentError}</Text> : null}
        {recentItems.length === 0 && !recentError ? (
          <Text style={styles.muted}>No recently added listings available.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recentItems.map((item) => (
              <Pressable key={item.id} style={styles.recentCard} onPress={() => navigation.navigate('AccommodationDetail', { id: item.id })}>
                <Text style={styles.recentName} numberOfLines={1}>{item.name}</Text>
                {item.isDemo ? <Text style={styles.demoSmall}>Demo</Text> : null}
                <Text style={styles.recentMeta} numberOfLines={1}>{[item.location?.locality, item.location?.city].filter(Boolean).join(', ')}</Text>
                <Text style={styles.recentRent}>₹{Number(item.pricing?.monthlyRent || 0).toLocaleString('en-IN')}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Accommodations</Text>
        <Text style={styles.countText}>{pagination.totalResults || 0} results</Text>
      </View>
    </View>
  ), [filters, recentItems, recentError, pagination.totalResults, user, navigation]);

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <FlatList data={[]} ListHeaderComponent={header} renderItem={null} ListFooterComponent={<View style={styles.centerPad}><ActivityIndicator size="large" color={colors.primaryNavy} /><Text style={styles.muted}>Loading accommodations...</Text></View>} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <AccommodationCard item={item} onPress={() => navigation.navigate('AccommodationDetail', { id: item.id })} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primaryNavy]} />}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!loading && !error ? <EmptyState title="No accommodations found" message="Try adjusting your filters or check back later for new approved listings." actionLabel="Clear filters" onAction={onClear} /> : null}
        ListFooterComponent={
          <View style={{ paddingVertical: 12 }}>
            {error ? <ErrorState message={error} onRetry={() => load({ reset: true, nextPage: 1, appliedFilters: applied })} /> : null}
            {loadingMore ? <ActivityIndicator color={colors.primaryNavy} /> : null}
            {!loadingMore && pagination.hasNextPage ? <Pressable style={styles.loadMoreBtn} onPress={onLoadMore}><Text style={styles.loadMoreText}>Load more</Text></Pressable> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.warmWhite },
  listContent: { padding: 16, paddingBottom: 24 },
  heroCard: { backgroundColor: colors.primaryNavy, borderRadius: 16, padding: 16, marginBottom: 14 },
  brand: { color: colors.white, fontSize: 24, fontWeight: '700' },
  tagline: { color: colors.goldenOrange, fontSize: 14, fontWeight: '600', marginTop: 2 },
  welcome: { color: colors.white, fontSize: 16, fontWeight: '600', marginTop: 10 },
  welcomeSub: { color: '#E6EEF8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  section: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.primaryNavy, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  countText: { fontSize: 12, color: colors.mutedText },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.bodyText, backgroundColor: colors.warmWhite, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.bodyText, marginBottom: 6, marginTop: 2 },
  chipRow: { marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, backgroundColor: colors.warmWhite },
  chipSelected: { backgroundColor: colors.primaryNavy, borderColor: colors.primaryNavy },
  chipText: { color: colors.bodyText, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.white },
  rentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rentInput: { flex: 1, marginRight: 8 },
  actionsRow: { flexDirection: 'row', marginTop: 4 },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  primaryBtn: { backgroundColor: colors.primaryNavy, marginRight: 8 },
  primaryBtnText: { color: colors.white, fontWeight: '700' },
  secondaryBtn: { backgroundColor: colors.softGrey },
  secondaryBtnText: { color: colors.primaryNavy, fontWeight: '700' },
  recentCard: { width: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, marginRight: 10, backgroundColor: colors.lightCream },
  recentName: { fontSize: 14, fontWeight: '700', color: colors.primaryNavy },
  demoSmall: { fontSize: 10, color: colors.warmOrange, fontWeight: '700', marginTop: 2 },
  recentMeta: { fontSize: 12, color: colors.mutedText, marginTop: 4 },
  recentRent: { fontSize: 14, fontWeight: '700', color: colors.bodyText, marginTop: 6 },
  muted: { color: colors.mutedText, fontSize: 13 },
  inlineError: { color: colors.error, fontSize: 13, marginBottom: 6 },
  centerPad: { alignItems: 'center', paddingVertical: 24 },
  loadMoreBtn: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.softGrey },
  loadMoreText: { color: colors.primaryNavy, fontWeight: '700' },
});
