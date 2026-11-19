/**
 * Controlled admin account setup utility (Mess Hunt)
 *
 * Purpose: create or update an admin account in a controlled, secure way.
 * - No public admin registration endpoint should be exposed.
 * - Run locally by a trusted developer/admin only.
 * - Do not hardcode credentials in source code.
 *
 * Usage (PowerShell example):
 *   cd .\backend
 *   $env:ADMIN_NAME="Admin Name"
 *   $env:ADMIN_EMAIL="admin@example.com"
 *   $env:ADMIN_PASSWORD="StrongPasswordHere"
 *   node .\src\seed\createAdmin.js
 *
 * Optional:
 *   $env:ADMIN_IS_DEMO="true"   # only for controlled demo environments
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { Admin } = require('../models');
const { ROLES } = require('../utils/constants');
const { isValidEmail, isValidPassword } = require('../utils/validators');

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const isDemo = String(process.env.ADMIN_IS_DEMO || '').toLowerCase() === 'true';

  if (!name || !email || !password) {
    throw new Error('ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD environment variables are required');
  }
  if (!isValidEmail(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }
  if (!isValidPassword(password, 8)) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  await connectDB();

  let admin = await Admin.findOne({ email }).select('+password');
  let created = false;

  if (!admin) {
    admin = await Admin.create({
      name,
      email,
      password,
      role: ROLES.ADMIN,
      isActive: true,
      isDemo,
    });
    created = true;
  } else {
    // Controlled update of existing admin account (trusted local operation)
    admin.name = name;
    admin.password = password; // will be hashed by pre-save hook
    admin.isActive = true;
    admin.isDemo = Boolean(admin.isDemo || isDemo);
    await admin.save();
  }

  console.log(created ? 'Admin account created successfully' : 'Admin account updated successfully');
  console.log({ id: String(admin._id), email: admin.email, isDemo: Boolean(admin.isDemo) });
}

main()
  .catch((err) => {
    console.error('Admin setup failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await disconnectDB();
      }
    } catch (err) {
      console.error('Error while closing DB connection:', err.message);
    }
  });
