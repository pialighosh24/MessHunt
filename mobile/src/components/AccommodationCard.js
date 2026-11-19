import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

function formatRent(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function AccommodationCard({ item, onPress }) {
  const photo = Array.isArray(item.photos) && item.photos.length > 0 ? (item.photos[0].secureUrl || item.photos[0].url) : null;
  const location = [item.location?.locality, item.location?.city].filter(Boolean).join(', ');
  const ratingText = item.reviewCount > 0 && item.averageRating != null ? `${item.averageRating} ★ (${item.reviewCount})` : 'No reviews yet';

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <View style={styles.row}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>Mess Hunt</Text>
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {item.isDemo ? <Text style={styles.demoBadge}>Demo</Text> : null}
          </View>
          <Text style={styles.location} numberOfLines={1}>{location || 'Location not specified'}</Text>
          <Text style={styles.rent}>{formatRent(item.pricing?.monthlyRent)} / month</Text>
          <View style={styles.metaRow}>
            <Text style={styles.chip}>{item.accommodationType || '—'}</Text>
            <Text style={styles.chip}>{item.roomDetails?.roomType || '—'}</Text>
            <Text style={styles.chip}>{item.foodInfo?.foodProvided ? 'Food' : 'No Food'}</Text>
          </View>
          <View style={styles.bottomRow}>
            <Text style={styles.rating}>{ratingText}</Text>
            <Text style={[styles.availability, item.availability?.status === 'Available' ? styles.available : styles.full]}>
              {item.availability?.status || '—'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.95 },
  row: { flexDirection: 'row' },
  image: { width: 112, height: 132, backgroundColor: colors.softGrey },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lightCream },
  placeholderText: { color: colors.primaryNavy, fontWeight: '700', fontSize: 12 },
  body: { flex: 1, padding: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.primaryNavy, marginRight: 6 },
  demoBadge: { fontSize: 10, color: colors.warmOrange, fontWeight: '700', backgroundColor: '#FFF3E0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  location: { fontSize: 12, color: colors.mutedText, marginTop: 2 },
  rent: { fontSize: 15, fontWeight: '700', color: colors.bodyText, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  chip: { fontSize: 11, color: colors.primaryNavy, backgroundColor: colors.softGrey, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginRight: 4, marginBottom: 4 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  rating: { fontSize: 12, color: colors.goldenOrange, fontWeight: '600' },
  availability: { fontSize: 11, fontWeight: '700' },
  available: { color: colors.success },
  full: { color: colors.error },
});
