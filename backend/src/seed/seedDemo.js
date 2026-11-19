/**
 * Mess Hunt - Demo seed framework (Phase 3)
 *
 * Safety requirements:
 * - Clearly identifies every demo record with isDemo: true
 * - Never seeds fake records into a real production environment
 * - Does not create a publicly accessible demo admin account with production privileges
 * - Safe/idempotent to run repeatedly (upserts only demo-tagged records by deterministic demo emails)
 * - Does not overwrite existing real records
 * - Does not generate fake reviews that could be mistaken for genuine student feedback
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { Student, Owner, Admin, Accommodation, Review } = require('../models');
const { ROLES, ACCOMMODATION_STATUS } = require('../utils/constants');

const DEMO_TAG = {
  studentEmail: 'demo.student@mess-hunt.local',
  ownerEmail: 'demo.owner@mess-hunt.local',
  adminEmail: 'demo.admin@mess-hunt.local',
};

function assertSafeDemoEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowDemoSeed = String(process.env.ALLOW_DEMO_SEED || '').toLowerCase() === 'true';

  if (nodeEnv === 'production' && !allowDemoSeed) {
    throw new Error(
      'Refusing to run demo seed in production. Set ALLOW_DEMO_SEED=true only for a controlled non-real demo environment.'
    );
  }

  if (nodeEnv === 'production' && allowDemoSeed) {
    console.warn('WARNING: ALLOW_DEMO_SEED=true in production. Ensure this is a non-real demo environment only.');
  }
}

async function upsertDemoUser(Model, filter, data) {
  // Only touch records that are explicitly demo-tagged by this deterministic demo identity.
  const existing = await Model.findOne(filter);
  if (existing && !existing.isDemo) {
    throw new Error(`Refusing to modify non-demo record for ${filter.email}`);
  }

  if (existing) {
    // Keep idempotent updates limited to demo records.
    Object.assign(existing, data, { isDemo: true });
    await existing.save();
    return { doc: existing, created: false };
  }

  const created = await Model.create({ ...data, isDemo: true });
  return { doc: created, created: true };
}

async function seedDemo({ withSampleAccommodation = true } = {}) {
  assertSafeDemoEnvironment();
  await connectDB();

  console.log('Starting Mess Hunt demo seed (safe/idempotent)...');

  // Demo student (clearly labeled demo account)
  const studentResult = await upsertDemoUser(
    Student,
    { email: DEMO_TAG.studentEmail },
    {
      name: 'Demo Student (Mess Hunt)',
      email: DEMO_TAG.studentEmail,
      password: 'Demo@12345',
      phone: '0000000000',
      role: ROLES.STUDENT,
      isActive: true,
      favourites: [],
    }
  );

  // Demo owner (clearly labeled demo account)
  const ownerResult = await upsertDemoUser(
    Owner,
    { email: DEMO_TAG.ownerEmail },
    {
      name: 'Demo Owner (Mess Hunt)',
      email: DEMO_TAG.ownerEmail,
      phone: '0000000000',
      password: 'Demo@12345',
      role: ROLES.OWNER,
      isVerified: true,
      isActive: true,
    }
  );

  // Optional demo admin account for controlled local/demo environments only.
  // Not for public access and never with real production privileges.
  const includeDemoAdmin = String(process.env.SEED_DEMO_ADMIN || '').toLowerCase() === 'true';
  let adminResult = null;
  if (includeDemoAdmin) {
    adminResult = await upsertDemoUser(
      Admin,
      { email: DEMO_TAG.adminEmail },
      {
        name: 'Demo Admin (Mess Hunt)',
        email: DEMO_TAG.adminEmail,
        password: 'Demo@12345',
        role: ROLES.ADMIN,
        isActive: true,
      }
    );
  }

  let accommodation = null;
  if (withSampleAccommodation) {
    // Upsert a clearly demo-labeled accommodation owned by demo owner only.
    const demoAccommodationName = 'Demo Mess Accommodation (Sample)';
    const existingAcc = await Accommodation.findOne({ owner: ownerResult.doc._id, name: demoAccommodationName });
    if (existingAcc && !existingAcc.isDemo) {
      throw new Error('Refusing to modify non-demo accommodation record');
    }

    const accommodationData = {
      owner: ownerResult.doc._id,
      name: demoAccommodationName,
      description:
        'DEMO LISTING: This is fictional sample data for Mess Hunt demonstration only. Not a real accommodation listing.',
      accommodationType: 'Mess',
      genderType: 'Co-ed',
      suitableFor: 'Students (demo)',
      location: {
        state: 'Demo State',
        district: 'Demo District',
        city: 'Demo City',
        locality: 'Demo Locality',
        fullAddress: 'Demo Address, Demo Locality, Demo City',
        landmark: 'Near Demo Landmark',
        googleMapsLink: 'https://maps.google.com/?q=Demo+Location',
      },
      pricing: {
        monthlyRent: 3000,
        securityDeposit: 1000,
        electricityCharges: 0,
        waterCharges: 0,
        foodCharges: 0,
        otherCharges: 0,
        includedChargesInfo: 'DEMO: Sample charges shown for demonstration only.',
        extraChargesInfo: 'DEMO: Extra charges may apply (sample).',
      },
      roomDetails: {
        roomType: 'Shared',
        totalRooms: 5,
        availableRoomsOrBeds: 2,
        bathroomType: 'Shared',
        furnishing: 'DEMO: Basic furnishing sample',
      },
      foodInfo: {
        foodProvided: false,
        selfCookingAllowed: false,
        homeFoodDeliveryAllowed: true,
      },
      facilities: ['Wi-Fi', 'Drinking Water', 'Study Table'],
      rules: {
        entryTiming: 'DEMO: 10:00 PM',
        visitorRules: 'DEMO: As per owner policy',
        additionalRules: 'DEMO: Sample rules only',
      },
      availability: {
        status: 'Available',
        availableBeds: 2,
        availableFrom: null,
      },
      contact: {
        ownerDisplayName: 'Demo Owner (Mess Hunt)',
        contactNumber: '0000000000',
      },
      photos: [],
      status: ACCOMMODATION_STATUS.PENDING,
      rejectionReason: '',
      isDemo: true,
    };

    if (existingAcc) {
      Object.assign(existingAcc, accommodationData);
      await existingAcc.save();
      accommodation = existingAcc;
    } else {
      accommodation = await Accommodation.create(accommodationData);
    }
  }

  // IMPORTANT: Do not generate fake reviews that could be mistaken for genuine student feedback.
  // If demo reviews are ever needed, they must be explicitly labeled [DEMO] in UI and stored as isDemo.
  const demoReviewCount = await Review.countDocuments({ isDemo: true });

  console.log('Demo seed completed safely.');
  console.log({
    student: studentResult.created ? 'created' : 'updated',
    owner: ownerResult.created ? 'created' : 'updated',
    admin: adminResult ? (adminResult.created ? 'created' : 'updated') : 'skipped (SEED_DEMO_ADMIN not enabled)',
    accommodation: accommodation ? 'created/updated' : 'skipped',
    demoReviewsExisting: demoReviewCount,
    note: 'No fake reviews generated. All seeded records are marked isDemo=true.',
  });
}

async function main() {
  try {
    await seedDemo();
  } catch (err) {
    console.error('Demo seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) {
        await disconnectDB();
      }
    } catch (closeErr) {
      console.error('Error while closing DB connection after seed:', closeErr.message);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { seedDemo, assertSafeDemoEnvironment, DEMO_TAG };
