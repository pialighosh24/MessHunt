import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { getMyAccommodation, createAccommodation, updateAccommodation, uploadPhotos, deletePhoto } from '../services/api';

const empty = () => ({
  name: '', description: '', accommodationType: 'PG', genderType: 'Co-ed', suitableFor: '',
  location: { state: '', district: '', city: '', locality: '', fullAddress: '', landmark: '', googleMapsLink: '' },
  pricing: { monthlyRent: '', securityDeposit: '', electricityCharges: '', waterCharges: '', foodCharges: '', otherCharges: '', includedChargesInfo: '', extraChargesInfo: '' },
  roomDetails: { roomType: 'Single', totalRooms: '', availableRoomsOrBeds: '', bathroomType: 'Shared', furnishing: '' },
  foodInfo: { foodProvided: false, selfCookingAllowed: false, homeFoodDeliveryAllowed: false },
  facilitiesText: '',
  rules: { entryTiming: '', visitorRules: '', additionalRules: '' },
  availability: { status: 'Available', availableBeds: '', availableFrom: '' },
  contact: { ownerDisplayName: '', contactNumber: '' },
});

function toNum(v) { if (v === '' || v === null || v === undefined) return 0; const n = Number(v); return Number.isFinite(n) ? n : 0; }
function toNumOrNull(v) { if (v === '' || v === null || v === undefined) return 0; const n = Number(v); return Number.isFinite(n) ? n : 0; }

function fromApi(a) {
  return {
    name: a.name || '', description: a.description || '', accommodationType: a.accommodationType || 'PG', genderType: a.genderType || 'Co-ed', suitableFor: a.suitableFor || '',
    location: {
      state: a.location?.state || '', district: a.location?.district || '', city: a.location?.city || '', locality: a.location?.locality || '',
      fullAddress: a.location?.fullAddress || '', landmark: a.location?.landmark || '', googleMapsLink: a.location?.googleMapsLink || '',
    },
    pricing: {
      monthlyRent: a.pricing?.monthlyRent ?? '', securityDeposit: a.pricing?.securityDeposit ?? '', electricityCharges: a.pricing?.electricityCharges ?? '',
      waterCharges: a.pricing?.waterCharges ?? '', foodCharges: a.pricing?.foodCharges ?? '', otherCharges: a.pricing?.otherCharges ?? '',
      includedChargesInfo: a.pricing?.includedChargesInfo || '', extraChargesInfo: a.pricing?.extraChargesInfo || '',
    },
    roomDetails: {
      roomType: a.roomDetails?.roomType || 'Single', totalRooms: a.roomDetails?.totalRooms ?? '', availableRoomsOrBeds: a.roomDetails?.availableRoomsOrBeds ?? '',
      bathroomType: a.roomDetails?.bathroomType || 'Shared', furnishing: a.roomDetails?.furnishing || '',
    },
    foodInfo: {
      foodProvided: Boolean(a.foodInfo?.foodProvided), selfCookingAllowed: Boolean(a.foodInfo?.selfCookingAllowed), homeFoodDeliveryAllowed: Boolean(a.foodInfo?.homeFoodDeliveryAllowed),
    },
    facilitiesText: Array.isArray(a.facilities) ? a.facilities.join(', ') : '',
    rules: { entryTiming: a.rules?.entryTiming || '', visitorRules: a.rules?.visitorRules || '', additionalRules: a.rules?.additionalRules || '' },
    availability: { status: a.availability?.status || 'Available', availableBeds: a.availability?.availableBeds ?? '', availableFrom: a.availability?.availableFrom ? String(a.availability.availableFrom).slice(0,10) : '' },
    contact: { ownerDisplayName: a.contact?.ownerDisplayName || '', contactNumber: a.contact?.contactNumber || '' },
  };
}

function buildPayload(f) {
  const facilities = f.facilitiesText.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    accommodationType: f.accommodationType,
    genderType: f.genderType,
    suitableFor: f.suitableFor.trim(),
    location: {
      state: f.location.state.trim(), district: f.location.district.trim(), city: f.location.city.trim(), locality: f.location.locality.trim(),
      fullAddress: f.location.fullAddress.trim(), landmark: f.location.landmark.trim(), googleMapsLink: f.location.googleMapsLink.trim(),
    },
    pricing: {
      monthlyRent: toNum(f.pricing.monthlyRent), securityDeposit: toNum(f.pricing.securityDeposit), electricityCharges: toNum(f.pricing.electricityCharges),
      waterCharges: toNum(f.pricing.waterCharges), foodCharges: toNum(f.pricing.foodCharges), otherCharges: toNum(f.pricing.otherCharges),
      includedChargesInfo: f.pricing.includedChargesInfo.trim(), extraChargesInfo: f.pricing.extraChargesInfo.trim(),
    },
    roomDetails: {
      roomType: f.roomDetails.roomType, totalRooms: toNum(f.roomDetails.totalRooms), availableRoomsOrBeds: toNum(f.roomDetails.availableRoomsOrBeds),
      bathroomType: f.roomDetails.bathroomType, furnishing: f.roomDetails.furnishing.trim(),
    },
    foodInfo: { ...f.foodInfo },
    facilities,
    rules: { entryTiming: f.rules.entryTiming.trim(), visitorRules: f.rules.visitorRules.trim(), additionalRules: f.rules.additionalRules.trim() },
    availability: { status: f.availability.status, availableBeds: toNum(f.availability.availableBeds), availableFrom: f.availability.availableFrom || null },
    contact: { ownerDisplayName: f.contact.ownerDisplayName.trim(), contactNumber: f.contact.contactNumber.trim() },
  };
}

export default function AccommodationFormPage({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(empty());
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      try {
        const a = await getMyAccommodation(id);
        if (mounted) { setCurrent(a); setForm(fromApi(a)); }
      } catch (e) {
        if (mounted) setError(e.message || 'Failed to load listing.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isEdit, id]);

  const setTop = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setCheck = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));
  const setNested = (group, key) => (e) => setForm((p) => ({ ...p, [group]: { ...p[group], [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (isEdit) {
        const res = await updateAccommodation(id, payload);
        setSuccess(res?.accommodation ? 'Listing updated successfully.' : 'Listing updated.');
        if (res?.accommodation) { setCurrent(res.accommodation); setForm(fromApi(res.accommodation)); }
      } else {
        const acc = await createAccommodation(payload);
        setSuccess('Listing created and submitted for review.');
        navigate(`/accommodations/${acc.id}`);
      }
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setUploading(true); setError(''); setSuccess('');
    try {
      await uploadPhotos(id, files);
      const a = await getMyAccommodation(id);
      setCurrent(a); setForm(fromApi(a));
      setSuccess('Photo(s) uploaded successfully.');
    } catch (err) {
      setError(err.message || 'Photo upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const onDeletePhoto = async (photoId) => {
    if (!window.confirm('Remove this photo?')) return;
    try {
      await deletePhoto(id, photoId);
      const a = await getMyAccommodation(id);
      setCurrent(a); setForm(fromApi(a));
    } catch (err) {
      setError(err.message || 'Failed to remove photo.');
    }
  };

  if (loading) return <Layout title={isEdit ? 'Edit Listing' : 'Add Listing'}><div className="card"><p className="muted">Loading...</p></div></Layout>;

  return (
    <Layout title={isEdit ? 'View / Edit Listing' : 'Add New Listing'} subtitle={isEdit ? 'Update details, manage photos, and track approval status.' : 'Create a listing. New listings are submitted for admin review (pending).'} actions={isEdit ? <Link className="btn btn-secondary" to="/accommodations">Back to listings</Link> : null}>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {isEdit && current && (
        <div className="card">
          <h3>Status & Info</h3>
          <p><strong>Status:</strong> <span className={`badge badge-${current.status}`}>{current.status}</span></p>
          {current.status === 'rejected' && current.rejectionReason ? <p><strong>Rejection reason:</strong> {current.rejectionReason}</p> : null}
          <p className="muted small">Editing an approved or rejected listing may resubmit it for admin review (pending), as per workflow rules.</p>
        </div>
      )}

      <form onSubmit={onSubmit} className="form-grid">
        <div className="card">
          <h3>Basic Information</h3>
          <label>Accommodation name<input value={form.name} onChange={setTop('name')} required /></label>
          <label>Description<textarea value={form.description} onChange={setTop('description')} required rows={4} /></label>
          <div className="grid-2">
            <label>Accommodation type<select value={form.accommodationType} onChange={setTop('accommodationType')}><option>Mess</option><option>PG</option><option>Hostel</option></select></label>
            <label>Gender type<select value={form.genderType} onChange={setTop('genderType')}><option>Boys</option><option>Girls</option><option>Co-ed</option></select></label>
          </div>
          <label>Suitable for<input value={form.suitableFor} onChange={setTop('suitableFor')} placeholder="e.g. Students, Working professionals" /></label>
        </div>

        <div className="card">
          <h3>Location</h3>
          <div className="grid-2">
            <label>State<input value={form.location.state} onChange={setNested('location','state')} required /></label>
            <label>District<input value={form.location.district} onChange={setNested('location','district')} required /></label>
            <label>City<input value={form.location.city} onChange={setNested('location','city')} required /></label>
            <label>Locality<input value={form.location.locality} onChange={setNested('location','locality')} required /></label>
          </div>
          <label>Full address<textarea value={form.location.fullAddress} onChange={setNested('location','fullAddress')} required rows={2} /></label>
          <div className="grid-2">
            <label>Landmark<input value={form.location.landmark} onChange={setNested('location','landmark')} /></label>
            <label>Google Maps link<input value={form.location.googleMapsLink} onChange={setNested('location','googleMapsLink')} required placeholder="https://maps.google.com/..." /></label>
          </div>
        </div>

        <div className="card">
          <h3>Pricing</h3>
          <div className="grid-3">
            <label>Monthly rent (₹)<input type="number" min="0" value={form.pricing.monthlyRent} onChange={setNested('pricing','monthlyRent')} required /></label>
            <label>Security deposit<input type="number" min="0" value={form.pricing.securityDeposit} onChange={setNested('pricing','securityDeposit')} /></label>
            <label>Electricity charges<input type="number" min="0" value={form.pricing.electricityCharges} onChange={setNested('pricing','electricityCharges')} /></label>
            <label>Water charges<input type="number" min="0" value={form.pricing.waterCharges} onChange={setNested('pricing','waterCharges')} /></label>
            <label>Food charges<input type="number" min="0" value={form.pricing.foodCharges} onChange={setNested('pricing','foodCharges')} /></label>
            <label>Other charges<input type="number" min="0" value={form.pricing.otherCharges} onChange={setNested('pricing','otherCharges')} /></label>
          </div>
          <label>Included charges info<input value={form.pricing.includedChargesInfo} onChange={setNested('pricing','includedChargesInfo')} /></label>
          <label>Extra charges info<input value={form.pricing.extraChargesInfo} onChange={setNested('pricing','extraChargesInfo')} /></label>
        </div>

        <div className="card">
          <h3>Room & Food</h3>
          <div className="grid-3">
            <label>Room type<select value={form.roomDetails.roomType} onChange={setNested('roomDetails','roomType')}><option>Single</option><option>Double</option><option>Shared</option></select></label>
            <label>Bathroom type<select value={form.roomDetails.bathroomType} onChange={setNested('roomDetails','bathroomType')}><option>Attached</option><option>Shared</option></select></label>
            <label>Furnishing<input value={form.roomDetails.furnishing} onChange={setNested('roomDetails','furnishing')} /></label>
            <label>Total rooms<input type="number" min="0" value={form.roomDetails.totalRooms} onChange={setNested('roomDetails','totalRooms')} /></label>
            <label>Available rooms/beds<input type="number" min="0" value={form.roomDetails.availableRoomsOrBeds} onChange={setNested('roomDetails','availableRoomsOrBeds')} /></label>
          </div>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={form.foodInfo.foodProvided} onChange={setNested('foodInfo','foodProvided')} /> Food provided</label>
            <label className="check"><input type="checkbox" checked={form.foodInfo.selfCookingAllowed} onChange={setNested('foodInfo','selfCookingAllowed')} /> Self-cooking allowed</label>
            <label className="check"><input type="checkbox" checked={form.foodInfo.homeFoodDeliveryAllowed} onChange={setNested('foodInfo','homeFoodDeliveryAllowed')} /> Home-food delivery allowed</label>
          </div>
        </div>

        <div className="card">
          <h3>Facilities & Rules</h3>
          <label>Facilities (comma-separated)<input value={form.facilitiesText} onChange={setTop('facilitiesText')} placeholder="WiFi, Laundry, Parking" /></label>
          <div className="grid-2">
            <label>Entry timing<input value={form.rules.entryTiming} onChange={setNested('rules','entryTiming')} /></label>
            <label>Visitor rules<input value={form.rules.visitorRules} onChange={setNested('rules','visitorRules')} /></label>
          </div>
          <label>Additional rules<textarea value={form.rules.additionalRules} onChange={setNested('rules','additionalRules')} rows={2} /></label>
        </div>

        <div className="card">
          <h3>Availability & Contact</h3>
          <div className="grid-3">
            <label>Availability status<select value={form.availability.status} onChange={setNested('availability','status')}><option>Available</option><option>Full</option></select></label>
            <label>Available beds<input type="number" min="0" value={form.availability.availableBeds} onChange={setNested('availability','availableBeds')} /></label>
            <label>Available from<input type="date" value={form.availability.availableFrom} onChange={setNested('availability','availableFrom')} /></label>
          </div>
          <div className="grid-2">
            <label>Owner display name<input value={form.contact.ownerDisplayName} onChange={setNested('contact','ownerDisplayName')} required /></label>
            <label>Contact number<input value={form.contact.contactNumber} onChange={setNested('contact','contactNumber')} required /></label>
          </div>
        </div>

        <div className="form-actions card">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : (isEdit ? 'Save changes' : 'Create listing')}</button>
          <Link className="btn btn-secondary" to="/accommodations">Cancel</Link>
        </div>
      </form>

      {isEdit && current && (
        <div className="card">
          <h3>Photos</h3>
          <p className="muted small">Upload JPG/PNG/WebP images (validated by server). Photos are stored locally in demo mode.</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onUpload} disabled={uploading} />
          {uploading && <p className="muted">Uploading...</p>}
          <div className="photo-grid">
            {(current.photos || []).length === 0 ? <p className="muted">No photos uploaded yet.</p> : current.photos.map((p) => (
              <div key={p.id || p.publicId || p.url} className="photo-item">
                <img src={(p.secureUrl || p.url || '').startsWith('http') ? (p.secureUrl || p.url) : `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api$/, '')}${p.secureUrl || p.url}`} alt={p.filename || 'Accommodation photo'} />
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onDeletePhoto(p.id || p.publicId)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
