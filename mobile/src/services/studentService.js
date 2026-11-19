import apiClient from '../api/client';

export async function getProfile() {
  const response = await apiClient.get('/students/profile', { auth: true });
  return response?.data?.user || null;
}

export async function updateProfile(payload) {
  const response = await apiClient.patch('/students/profile', payload, { auth: true });
  return response?.data?.user || null;
}

export async function getFavourites() {
  const response = await apiClient.get('/students/favourites', { auth: true });
  return response?.data || { favourites: [], count: 0 };
}

export async function addFavourite(accommodationId) {
  const response = await apiClient.post(`/students/favourites/${accommodationId}`, {}, { auth: true });
  return response?.data || null;
}

export async function removeFavourite(accommodationId) {
  const response = await apiClient.delete(`/students/favourites/${accommodationId}`, { auth: true });
  return response?.data || null;
}

export default { getProfile, updateProfile, getFavourites, addFavourite, removeFavourite };
