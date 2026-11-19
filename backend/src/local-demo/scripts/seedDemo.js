require('dotenv').config();

const { initStore, withWriteLock, getCollections, backupStore } = require('../store');
const { hashPassword } = require('../utils/password');
const { createBaseUser, findEmailInAnyCollection } = require('../utils/storeHelpers');
const { newId } = require('../ids');
const { ROLES, ACCOMMODATION_STATUS, AVAILABILITY_STATUS } = require('../../utils/constants');
const { normalizeEmail } = require('../../utils/validators');

function nowIso() { return new Date().toISOString(); }

function isStoreEmpty() {
  const c = getCollections();
  return c.students.length === 0 && c.owners.length === 0 && c.admins.length === 0 && c.accommodations.length === 0 && c.reviews.length === 0;
}

function hasDemoSeedMarker() {
  const c = getCollections();
  return c.accommodations.some((a) => a.isDemo === true && a.demoSeedTag === 'mess-hunt-local-demo-seed-v1');
}

async function main() {
  if (String(process.env.APP_MODE || '').trim().toLowerCase() !== 'local-demo') {
    console.error('Refusing to run: APP_MODE must be "local-demo" for local demo seeding.');
    process.exit(1);
  }

  if (String(process.env.LOCAL_DEMO_SEED_SAMPLE_DATA || 'true').trim().toLowerCase() === 'false') {
    console.log('LOCAL_DEMO_SEED_SAMPLE_DATA is false. Skipping demo seed.');
    process.exit(0);
  }

  await initStore();

  if (!isStoreEmpty()) {
    if (hasDemoSeedMarker()) {
      console.log('Demo seed data already present. No changes made (idempotent).');
    } else {
      console.log('Store is not empty and no seed marker found. Skipping seed to avoid duplicates or overwriting user data.');
    }
    process.exit(0);
  }

  await backupStore('before-demo-seed');

  const demoPassword = 'DemoPass123!';
  const [studentHash, ownerHash] = await Promise.all([hashPassword(demoPassword), hashPassword(demoPassword)]);

  await withWriteLock(async (state) => {
    // Double-check inside lock
    const empty = state.students.length === 0 && state.owners.length === 0 && state.admins.length === 0 && state.accommodations.length === 0 && state.reviews.length === 0;
    if (!empty) return;

    const ts = nowIso();

    const student = createBaseUser({
      name: 'Demo Student',
      email: 'student.demo@messhunt.local',
      phone: '9000000001',
      role: ROLES.STUDENT,
      passwordHash: studentHash,
      isActive: true,
      isDemo: true,
      extra: { favourites: [] },
    });

    const owner = createBaseUser({
      name: 'Demo Owner',
      email: 'owner.demo@messhunt.local',
      phone: '9000000002',
      role: ROLES.OWNER,
      passwordHash: ownerHash,
      isActive: true,
      isDemo: true,
      extra: { isVerified: true },
    });

    state.students.push(student);
    state.owners.push(owner);

    const makeAccommodation = (overrides) => {
      const id = newId();
      return {
        _id: id,
        owner: owner._id,
        name: overrides.name,
        description: overrides.description,
        accommodationType: overrides.accommodationType,
        genderType: overrides.genderType,
        suitableFor: overrides.suitableFor || '',
        location: {
          state: overrides.state || 'Karnataka',
          district: overrides.district || 'Bengaluru Urban',
          city: overrides.city || 'Bengaluru',
          locality: overrides.locality || 'BTM Layout',
          fullAddress: overrides.fullAddress || 'Sample address, BTM Layout, Bengaluru',
          landmark: overrides.landmark || 'Near Main Road',
          googleMapsLink: overrides.googleMapsLink || 'https://maps.google.com/?q=BTM+Layout+Bengaluru',
        },
        pricing: {
          monthlyRent: overrides.monthlyRent,
          securityDeposit: overrides.securityDeposit ?? 5000,
          electricityCharges: overrides.electricityCharges ?? 0,
          waterCharges: overrides.waterCharges ?? 0,
          foodCharges: overrides.foodCharges ?? 0,
          otherCharges: overrides.otherCharges ?? 0,
          includedChargesInfo: overrides.includedChargesInfo || '',
          extraChargesInfo: overrides.extraChargesInfo || '',
        },
        roomDetails: {
          roomType: overrides.roomType || 'Shared',
          totalRooms: overrides.totalRooms ?? 10,
          availableRoomsOrBeds: overrides.availableRoomsOrBeds ?? 3,
          bathroomType: overrides.bathroomType || 'Shared',
          furnishing: overrides.furnishing || 'Semi-furnished',
        },
        foodInfo: {
          foodProvided: overrides.foodProvided ?? true,
          selfCookingAllowed: overrides.selfCookingAllowed ?? false,
          homeFoodDeliveryAllowed: overrides.homeFoodDeliveryAllowed ?? true,
        },
        facilities: overrides.facilities || ['WiFi', 'Laundry', 'Drinking Water'],
        rules: {
          entryTiming: overrides.entryTiming || '6:00 AM - 10:30 PM',
          visitorRules: overrides.visitorRules || 'Visitors allowed in common area',
          additionalRules: overrides.additionalRules || '',
        },
        availability: {
          status: AVAILABILITY_STATUS.AVAILABLE,
          availableBeds: overrides.availableBeds ?? 3,
          availableFrom: null,
        },
        contact: {
          ownerDisplayName: 'Demo Owner',
          contactNumber: '9000000002',
        },
        photos: [],
        status: ACCOMMODATION_STATUS.APPROVED,
        rejectionReason: '',
        isDemo: true,
        demoSeedTag: 'mess-hunt-local-demo-seed-v1',
        createdAt: ts,
        updatedAt: ts,
      };
    };

    state.accommodations.push(
      makeAccommodation({
        name: '[Demo] Sunrise Student Mess',
        description: 'Sample/demo listing for local demonstration. Affordable mess with homely food near colleges.',
        accommodationType: 'Mess',
        genderType: 'Co-ed',
        suitableFor: 'Students',
        locality: 'BTM Layout',
        monthlyRent: 5500,
        foodProvided: true,
        roomType: 'Shared',
        facilities: ['WiFi', 'Meals', 'RO Water', 'Power Backup'],
      }),
      makeAccommodation({
        name: '[Demo] Comfort Boys PG',
        description: 'Sample/demo listing for local demonstration. Clean PG accommodation for students and working professionals.',
        accommodationType: 'PG',
        genderType: 'Boys',
        suitableFor: 'Students',
        locality: 'HSR Layout',
        monthlyRent: 7500,
        foodProvided: false,
        selfCookingAllowed: true,
        roomType: 'Double',
        facilities: ['WiFi', 'Laundry', 'Parking', 'CCTV'],
      }),
      makeAccommodation({
        name: '[Demo] Green View Girls Hostel',
        description: 'Sample/demo listing for local demonstration. Secure hostel with essential amenities.',
        accommodationType: 'Hostel',
        genderType: 'Girls',
        suitableFor: 'Students',
        locality: 'Koramangala',
        monthlyRent: 9000,
        securityDeposit: 8000,
        foodProvided: true,
        roomType: 'Single',
        facilities: ['WiFi', 'Meals', 'Security', 'Study Area'],
      })
    );
  });

  console.log('Local demo seed data created (store was empty).');
  console.log('Demo accounts (clearly labeled sample data):');
  console.log('- Student: student.demo@messhunt.local / DemoPass123!');
  console.log('- Owner:   owner.demo@messhunt.local / DemoPass123!');
  console.log('Note: Create admin separately using the admin init script with env-provided credentials.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to seed local demo data:', err.message);
  process.exit(1);
});
