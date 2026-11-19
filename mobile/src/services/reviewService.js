import apiClient from '../api/client';

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function listAccommodationReviews(accommodationId, params = {}) {
  const response = await apiClient.get(`/accommodations/${accommodationId}/reviews${toQueryString(params)}`);
  return response?.data || { reviews: [], pagination: {} };
}

export async function createAccommodationReview(accommodationId, payload) {
  const response = await apiClient.post(`/accommodations/${accommodationId}/reviews`, payload, { auth: true });
  return response?.data || null;
}

export async function updateReview(reviewId, payload) {
  const response = await apiClient.patch(`/reviews/${reviewId}`, payload, { auth: true });
  return response?.data || null;
}

export async function deleteReview(reviewId) {
  const response = await apiClient.delete(`/reviews/${reviewId}`, { auth: true });
  return response?.data || null;
}

export async function reportReview(reviewId, payload) {
  const response = await apiClient.post(`/reviews/${reviewId}/report`, payload, { auth: true });
  return response?.data || null;
}

export default { listAccommodationReviews, createAccommodationReview, updateReview, deleteReview, reportReview };
