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

export async function listPublicAccommodations(params = {}) {
  const response = await apiClient.get(`/accommodations${toQueryString(params)}`);
  return response?.data || { accommodations: [], pagination: {} };
}

export async function getPublicAccommodationById(id) {
  const response = await apiClient.get(`/accommodations/${id}`);
  return response?.data || null;
}

export default { listPublicAccommodations, getPublicAccommodationById };
