/**
 * One-time seed script to populate chefName for known brands.
 *
 * Usage:
 *   node backend/scripts/seedChefs.js
 *
 * Make sure your .env has the correct MONGODB_URI before running.
 */
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Brand from '../models/brand.js'

dotenv.config()

const CHEF_MAP = {
  'Al Mashawi': 'Dev',
  'Chicbun': 'Dev',
  'Skope Cafe': 'Yash',
  'KKK': 'Rajan',
  'Punjabi House': 'Manjur',
  'Pet Fresh': 'Somu',
  'Doughpamine': 'Kaif',
  'GredoFoods': 'Laltu',
  'Swanky Spoon Society': 'Laltu',
}

async function run() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI
    if (!uri) {
      console.error('MONGODB_URI / MONGO_URI not set')
      process.exit(1)
    }

    await mongoose.connect(uri)
    console.log('Connected to MongoDB')

    const entries = Object.entries(CHEF_MAP)
    for (const [brandName, chefName] of entries) {
      const updated = await Brand.findOneAndUpdate(
        { brandName },
        { chefName },
        { new: true }
      )
      if (updated) {
        console.log(`Updated: ${brandName} -> ${chefName}`)
      } else {
        console.warn(`Brand not found, skipping: ${brandName}`)
      }
    }

    await mongoose.disconnect()
    console.log('Done.')
  } catch (err) {
    console.error('Seed failed:', err)
    process.exit(1)
  }
}

run()


