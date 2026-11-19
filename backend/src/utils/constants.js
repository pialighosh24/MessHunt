const ROLES = Object.freeze({
  STUDENT: 'student',
  OWNER: 'owner',
  ADMIN: 'admin',
});

const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

const ACCOMMODATION_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const ACCOMMODATION_TYPES = Object.freeze(['Mess', 'PG', 'Hostel']);
const GENDER_TYPES = Object.freeze(['Boys', 'Girls', 'Co-ed']);
const ROOM_TYPES = Object.freeze(['Single', 'Double', 'Shared']);
const BATHROOM_TYPES = Object.freeze(['Attached', 'Shared']);
const AVAILABILITY_STATUS = Object.freeze(
  Object.assign(['Available', 'Full'], {
    AVAILABLE: 'Available',
    FULL: 'Full',
  })
);

const MODERATION_STATUS = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
  REMOVED: 'removed',
});

module.exports = {
  ROLES,
  ACCOUNT_STATUS,
  ACCOMMODATION_STATUS,
  ACCOMMODATION_TYPES,
  GENDER_TYPES,
  ROOM_TYPES,
  BATHROOM_TYPES,
  AVAILABILITY_STATUS,
  MODERATION_STATUS,
};
