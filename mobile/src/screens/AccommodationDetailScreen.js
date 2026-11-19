import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { getPublicAccommodationById } from '../services/accommodationService';
import {
  listAccommodationReviews,
  createAccommodationReview,
  updateReview,
  deleteReview,
  reportReview,
} from '../services/reviewService';
import { addFavourite, removeFavourite, getFavourites } from '../services/studentService';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';

function Row({ label, value }) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{Array.isArray(value) ? value.join(', ') : String(value)}</Text>
    </View>
  );
}

function money(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : String(v);
}

export default function AccommodationDetailScreen({ route, navigation }) {
  const { id } = route.params || {};
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [isFavourite, setIsFavourite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  // Review form state (create/edit own review in-session)
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [myReviewId, setMyReviewId] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');
  const [reviewErr, setReviewErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportingId, setReportingId] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPublicAccommodationById(id);
      setItem(data?.accommodation || null);
    } catch (e) {
      setError(e?.message || 'Failed to load accommodation details.');
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const data = await listAccommodationReviews(id, { page: 1, limit: 50 });
      setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
    } catch (e) {
      setReviewsError(e?.message || 'Failed to load reviews.');
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [id]);

  const loadFavouriteState = useCallback(async () => {
    try {
      const data = await getFavourites();
      const favs = Array.isArray(data?.favourites) ? data.favourites : [];
      setIsFavourite(favs.some((f) => String(f.id) === String(id)));
    } catch {
      // ignore; favourite toggle will still work
    }
  }, [id]);

  useEffect(() => { load(); loadReviews(); loadFavouriteState(); }, [load, loadReviews, loadFavouriteState]);

  const onToggleFavourite = async () => {
    setFavBusy(true);
    try {
      if (isFavourite) {
        await removeFavourite(id);
        setIsFavourite(false);
      } else {
        await addFavourite(id);
        setIsFavourite(true);
      }
    } catch (e) {
      Alert.alert('Favourites', e?.message || 'Could not update favourites.');
    } finally {
      setFavBusy(false);
    }
  };

  const onCall = async () => {
    const number = item?.contact?.contactNumber;
    if (!number) return;
    const url = `tel:${String(number).replace(/\s+/g, '')}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Call', 'Unable to open the phone dialer on this device.');
  };

  const onOpenMaps = async () => {
    const link = item?.location?.googleMapsLink;
    if (!link) return;
    try {
      const supported = await Linking.canOpenURL(link);
      if (supported) await Linking.openURL(link);
      else Alert.alert('Maps', 'Unable to open this link.');
    } catch {
      Alert.alert('Maps', 'Unable to open this link.');
    }
  };

  const onSubmitReview = async () => {
    setReviewErr(''); setReviewMsg('');
    const c = comment.trim();
    if (!c || c.length < 3) { setReviewErr('Please enter a comment (at least 3 characters).'); return; }
    setReviewBusy(true);
    try {
      if (editing && myReviewId) {
        const data = await updateReview(myReviewId, { rating, comment: c });
        setReviewMsg('Your review was updated successfully.');
        if (data?.review?.id) setMyReviewId(data.review.id);
      } else {
        const data = await createAccommodationReview(id, { rating, comment: c });
        const rid = data?.review?.id || null;
        setMyReviewId(rid);
        setReviewMsg('Your review was submitted successfully.');
      }
      setEditing(false);
      setComment('');
      setRating(5);
      await loadReviews();
      await load(); // refresh rating summary
    } catch (e) {
      setReviewErr(e?.message || 'Could not submit review.');
    } finally {
      setReviewBusy(false);
    }
  };

  const onEditMyReview = () => {
    // If we know our review ID from this session, allow editing by pre-filling is not possible without fetching it;
    // provide inline edit mode using current form values.
    if (!myReviewId) {
      Alert.alert('Edit review', 'Your review ID is not available in this session. If you just submitted it, use the edit option shown after submission. Otherwise, you can submit an updated review after deleting the previous one if needed.');
      return;
    }
    setEditing(true);
    setReviewMsg('Editing your review. Update rating/comment and submit.');
  };

  const onDeleteMyReview = async () => {
    if (!myReviewId) {
      Alert.alert('Delete review', 'Your review ID is not available in this session. If you created it earlier, please contact support or manage it when available.');
      return;
    }
    Alert.alert('Delete review', 'Are you sure you want to delete your review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setReviewBusy(true);
        try {
          await deleteReview(myReviewId);
          setMyReviewId(null);
          setEditing(false);
          setComment('');
          setRating(5);
          setReviewMsg('Your review was deleted.');
          await loadReviews();
          await load();
        } catch (e) {
          setReviewErr(e?.message || 'Could not delete review.');
        } finally {
          setReviewBusy(false);
        }
      } },
    ]);
  };

  const onReport = async (reviewId) => {
    const reason = reportReason.trim();
    if (reason.length < 5) { Alert.alert('Report review', 'Please enter a reason (at least 5 characters).'); return; }
    setReportBusy(true);
    try {
      await reportReview(reviewId, { reason });
      Alert.alert('Report submitted', 'Thank you. The review will be handled according to moderation policy.');
      setReportingId(null);
      setReportReason('');
    } catch (e) {
      Alert.alert('Report review', e?.message || 'Could not report review.');
    } finally {
      setReportBusy(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color={colors.primaryNavy} /><Text style={styles.muted}>Loading details...</Text></SafeAreaView>;
  }
  if (error || !item) {
    return <SafeAreaView style={styles.container}><ErrorState message={error || 'Accommodation not found.'} onRetry={load} /></SafeAreaView>;
  }

  const photos = Array.isArray(item.photos) ? item.photos : [];
  const ratingText = item.reviewCount > 0 && item.averageRating != null ? `${item.averageRating} ★ (${item.reviewCount} reviews)` : 'No reviews yet';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
          {photos.length === 0 ? (
            <View style={[styles.photo, styles.photoPlaceholder]}><Text style={styles.photoPlaceholderText}>Mess Hunt</Text><Text style={styles.muted}>No photos available</Text></View>
          ) : photos.map((p, idx) => (
            <Image key={`${p.publicId || p.url || idx}`} source={{ uri: p.secureUrl || p.url }} style={styles.photo} resizeMode="cover" />
          ))}
        </ScrollView>

        <View style={styles.headerCard}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{item.name}</Text>
            {item.isDemo ? <Text style={styles.demoBadge}>Demo</Text> : null}
          </View>
          <Text style={styles.sub}>{[item.location?.locality, item.location?.city, item.location?.state].filter(Boolean).join(', ')}</Text>
          <Text style={styles.rent}>{money(item.pricing?.monthlyRent)} / month</Text>
          <Text style={styles.rating}>{ratingText}</Text>
          <View style={styles.actionRow}>
            <Pressable style={[styles.smallBtn, isFavourite ? styles.favOn : styles.favOff]} onPress={onToggleFavourite} disabled={favBusy}>
              <Text style={[styles.smallBtnText, isFavourite ? styles.favOnText : styles.favOffText]}>{favBusy ? '...' : (isFavourite ? '♥ Saved' : '♡ Save')}</Text>
            </Pressable>
            {item.contact?.contactNumber ? <Pressable style={styles.smallBtnPrimary} onPress={onCall}><Text style={styles.smallBtnPrimaryText}>Call Now</Text></Pressable> : null}
            {item.location?.googleMapsLink ? <Pressable style={styles.smallBtnSecondary} onPress={onOpenMaps}><Text style={styles.smallBtnSecondaryText}>Open Maps</Text></Pressable> : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <Row label="Description" value={item.description} />
          <Row label="Address" value={item.location?.fullAddress} />
          <Row label="Landmark" value={item.location?.landmark} />
          <Row label="Type" value={item.accommodationType} />
          <Row label="Gender" value={item.genderType} />
          <Row label="Suitable for" value={item.suitableFor} />
          <Row label="Room type" value={item.roomDetails?.roomType} />
          <Row label="Bathroom" value={item.roomDetails?.bathroomType} />
          <Row label="Furnishing" value={item.roomDetails?.furnishing} />
          <Row label="Total rooms" value={item.roomDetails?.totalRooms} />
          <Row label="Available rooms/beds" value={item.roomDetails?.availableRoomsOrBeds} />
          <Row label="Food provided" value={item.foodInfo?.foodProvided ? 'Yes' : 'No'} />
          <Row label="Self-cooking allowed" value={item.foodInfo?.selfCookingAllowed ? 'Yes' : 'No'} />
          <Row label="Home-food delivery allowed" value={item.foodInfo?.homeFoodDeliveryAllowed ? 'Yes' : 'No'} />
          <Row label="Facilities" value={item.facilities} />
          <Row label="Entry timing" value={item.rules?.entryTiming} />
          <Row label="Visitor rules" value={item.rules?.visitorRules} />
          <Row label="Additional rules" value={item.rules?.additionalRules} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing</Text>
          <Row label="Monthly rent" value={money(item.pricing?.monthlyRent)} />
          <Row label="Security deposit" value={money(item.pricing?.securityDeposit)} />
          <Row label="Electricity charges" value={money(item.pricing?.electricityCharges)} />
          <Row label="Water charges" value={money(item.pricing?.waterCharges)} />
          <Row label="Food charges" value={money(item.pricing?.foodCharges)} />
          <Row label="Other charges" value={money(item.pricing?.otherCharges)} />
          <Row label="Included charges" value={item.pricing?.includedChargesInfo} />
          <Row label="Extra charges" value={item.pricing?.extraChargesInfo} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Availability & Contact</Text>
          <Row label="Status" value={item.availability?.status} />
          <Row label="Available beds" value={item.availability?.availableBeds} />
          <Row label="Owner display name" value={item.contact?.ownerDisplayName} />
          <Row label="Contact number" value={item.contact?.contactNumber} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reviews & Ratings</Text>
          <Text style={styles.muted}>{ratingText}. Reviews shown are based on eligible moderation status.</Text>
          {reviewsLoading ? <ActivityIndicator color={colors.primaryNavy} style={{ marginTop: 8 }} /> : null}
          {reviewsError ? <Text style={styles.errorText}>{reviewsError}</Text> : null}
          {!reviewsLoading && !reviewsError && reviews.length === 0 ? <EmptyState title="No reviews yet" message="Be the first to share your experience." /> : null}
          {reviews.map((r) => (
            <View key={r.id} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewer}>{r.reviewerDisplayName || 'Student'}</Text>
                <Text style={styles.reviewRating}>{r.rating} ★</Text>
              </View>
              <Text style={styles.reviewComment}>{r.comment}</Text>
              <Text style={styles.reviewDate}>{r.date ? new Date(r.date).toLocaleDateString() : ''}</Text>
              {reportingId === r.id ? (
                <View style={{ marginTop: 8 }}>
                  <TextInput style={styles.input} placeholder="Reason for reporting (min 5 chars)" placeholderTextColor={colors.mutedText} value={reportReason} onChangeText={setReportReason} />
                  <View style={styles.actionRow}>
                    <Pressable style={styles.smallBtnSecondary} onPress={() => { setReportingId(null); setReportReason(''); }}><Text style={styles.smallBtnSecondaryText}>Cancel</Text></Pressable>
                    <Pressable style={styles.smallBtnPrimary} onPress={() => onReport(r.id)} disabled={reportBusy}><Text style={styles.smallBtnPrimaryText}>{reportBusy ? '...' : 'Submit report'}</Text></Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => setReportingId(r.id)}><Text style={styles.linkText}>Report review</Text></Pressable>
              )}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editing ? 'Edit your review' : 'Write a review'}</Text>
          <Text style={styles.muted}>You can submit one review per accommodation. {myReviewId ? 'You have a review in this session.' : ''}</Text>
          <View style={styles.ratingPicker}>
            {[1,2,3,4,5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} style={[styles.starBtn, rating >= n && styles.starBtnActive]}>
                <Text style={[styles.starText, rating >= n && styles.starTextActive]}>{n}★</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline placeholder="Share your experience (3-1000 characters)" placeholderTextColor={colors.mutedText} value={comment} onChangeText={setComment} />
          {reviewErr ? <Text style={styles.errorText}>{reviewErr}</Text> : null}
          {reviewMsg ? <Text style={styles.successText}>{reviewMsg}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable style={styles.smallBtnPrimary} onPress={onSubmitReview} disabled={reviewBusy}>
              <Text style={styles.smallBtnPrimaryText}>{reviewBusy ? 'Please wait...' : (editing ? 'Update review' : 'Submit review')}</Text>
            </Pressable>
            {myReviewId ? <Pressable style={styles.smallBtnSecondary} onPress={onEditMyReview}><Text style={styles.smallBtnSecondaryText}>Edit mine</Text></Pressable> : null}
            {myReviewId ? <Pressable style={styles.smallBtnDanger} onPress={onDeleteMyReview}><Text style={styles.smallBtnDangerText}>Delete mine</Text></Pressable> : null}
          </View>
          {!myReviewId ? <Text style={styles.hint}>If you previously submitted a review, the server will prevent duplicates. After submitting here you can edit/delete it in this session.</Text> : null}
        </View>

        <Text style={styles.disclaimer}>Reviews reflect user experiences and are subject to moderation policy. Submitting a review does not imply a verified stay.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.warmWhite },
  content: { padding: 16, paddingBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warmWhite },
  gallery: { marginBottom: 12 },
  photo: { width: 320, height: 220, borderRadius: 14, marginRight: 10, backgroundColor: colors.softGrey },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lightCream, borderWidth: 1, borderColor: colors.border },
  photoPlaceholderText: { fontSize: 18, fontWeight: '700', color: colors.primaryNavy },
  headerCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.primaryNavy, marginRight: 8 },
  demoBadge: { fontSize: 11, color: colors.warmOrange, fontWeight: '700', backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sub: { color: colors.mutedText, marginTop: 4 },
  rent: { fontSize: 20, fontWeight: '700', color: colors.bodyText, marginTop: 8 },
  rating: { color: colors.goldenOrange, fontWeight: '700', marginTop: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, marginRight: 8, marginBottom: 8, borderWidth: 1 },
  favOn: { backgroundColor: '#FFF3E0', borderColor: colors.goldenOrange },
  favOff: { backgroundColor: colors.white, borderColor: colors.border },
  favOnText: { color: colors.warmOrange, fontWeight: '700' },
  favOffText: { color: colors.primaryNavy, fontWeight: '700' },
  smallBtnPrimary: { backgroundColor: colors.primaryNavy, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, marginRight: 8, marginBottom: 8 },
  smallBtnPrimaryText: { color: colors.white, fontWeight: '700' },
  smallBtnSecondary: { backgroundColor: colors.softGrey, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, marginRight: 8, marginBottom: 8 },
  smallBtnSecondaryText: { color: colors.primaryNavy, fontWeight: '700' },
  smallBtnDanger: { backgroundColor: '#FDECEC', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, marginRight: 8, marginBottom: 8 },
  smallBtnDangerText: { color: colors.error, fontWeight: '700' },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.primaryNavy, marginBottom: 8 },
  row: { marginBottom: 8 },
  rowLabel: { fontSize: 12, color: colors.mutedText, fontWeight: '600', marginBottom: 2 },
  rowValue: { fontSize: 14, color: colors.bodyText, lineHeight: 20 },
  muted: { color: colors.mutedText, fontSize: 13, lineHeight: 18 },
  reviewItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 10 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewer: { fontWeight: '700', color: colors.primaryNavy },
  reviewRating: { color: colors.goldenOrange, fontWeight: '700' },
  reviewComment: { color: colors.bodyText, marginTop: 4, lineHeight: 20 },
  reviewDate: { color: colors.mutedText, fontSize: 12, marginTop: 4 },
  linkText: { color: colors.primaryNavy, fontWeight: '600', marginTop: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.bodyText, backgroundColor: colors.warmWhite, marginTop: 8 },
  ratingPicker: { flexDirection: 'row', marginTop: 8 },
  starBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  starBtnActive: { backgroundColor: colors.goldenOrange, borderColor: colors.goldenOrange },
  starText: { color: colors.bodyText, fontWeight: '700' },
  starTextActive: { color: colors.white },
  errorText: { color: colors.error, marginTop: 6 },
  successText: { color: colors.success, marginTop: 6, fontWeight: '600' },
  hint: { color: colors.mutedText, fontSize: 12, marginTop: 8 },
  disclaimer: { color: colors.mutedText, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
