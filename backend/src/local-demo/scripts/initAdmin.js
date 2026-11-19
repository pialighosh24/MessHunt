require('dotenv').config();

const { initStore, withWriteLock, getCollections } = require('../store');
const { hashPassword } = require('../utils/password');
const { createBaseUser, findEmailInAnyCollection } = require('../utils/storeHelpers');
const { ROLES } = require('../../utils/constants');
const { isValidEmail, isValidPassword, normalizeEmail, trimString } = require('../../utils/validators');

async function main() {
  if (String(process.env.APP_MODE || '').trim().toLowerCase() !== 'local-demo') {
    console.error('Refusing to run: APP_MODE must be "local-demo" for local demo admin initialization.');
    process.exit(1);
  }

  const name = trimString(process.env.LOCAL_DEMO_ADMIN_NAME || 'Mess Hunt Admin');
  const email = normalizeEmail(process.env.LOCAL_DEMO_ADMIN_EMAIL || '');
  const password = process.env.LOCAL_DEMO_ADMIN_PASSWORD || '';

  const errors = [];
  if (!name) errors.push('LOCAL_DEMO_ADMIN_NAME is required');
  if (!isValidEmail(email)) errors.push('LOCAL_DEMO_ADMIN_EMAIL must be a valid email');
  if (!isValidPassword(password, 8)) errors.push('LOCAL_DEMO_ADMIN_PASSWORD must be at least 8 characters');
  if (errors.length) {
    console.error('Invalid local demo admin configuration:');
    errors.forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  }

  await initStore();

  const existing = findEmailInAnyCollection(email);
  if (existing) {
    if (existing.role === ROLES.ADMIN) {
      console.log(`Local demo admin already exists for ${email}. No changes made.`);
      process.exit(0);
    }
    console.error(`Cannot create admin: email ${email} is already used by a ${existing.role} account.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await withWriteLock(async (state) => {
    // Re-check inside lock
    const again = [state.students, state.owners, state.admins].some((u) => normalizeEmail(u.email) === email);
    if (again) {
      throw new Error('Email already exists (detected during write lock).');
    }
    const admin = createBaseUser({
      name,
      email,
      phone: '',
      role: ROLES.ADMIN,
      passwordHash,
      isActive: true,
      isDemo: false,
      extra: {},
    });
    state.admins.push(admin);
  });

  console.log(`Local demo admin account created successfully for ${email}.`);
  console.log('You can now log in via the admin dashboard/API using the configured credentials.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to initialize local demo admin:', err.message);
  process.exit(1);
});
