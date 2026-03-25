import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'

dotenv.config()

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not found — AI summaries will fallback.')
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

export const generateAnalysisSummary = async (formData, scoreResult) => {
  const { total_score_0_to_10, meets_threshold, section_scores, brand_name } = scoreResult
  const isApproved = meets_threshold && total_score_0_to_10 >= 8.5

  try {
    // Fix array fields (Gemini fails if array is passed directly)
    const activation = Array.isArray(formData.activationOpportunities)
      ? formData.activationOpportunities.join(', ')
      : formData.activationOpportunities || 'Not specified'

    const domestic = Array.isArray(formData.domesticOpportunities)
      ? formData.domesticOpportunities.join(', ')
      : formData.domesticOpportunities || 'Not specified'

    // Build context
    const context = `
Brand Name: ${brand_name}
Number of Outlets: ${formData.brandStrength || 'Not specified'}
Social Media Engagement: ${formData.socialMediaEngagement || 'Not specified'}
DSP Ratings: ${formData.dspRatings || 'Not specified'}
B&M Delivery Sales per Day: ${formData.bmDeliverySales || 'Not specified'}
Delivery AOV: ${formData.deliveryAOV || 'Not specified'}
COGS Analysis: ${formData.cogsAnalysis || 'Not specified'}
Wastage Risk: ${formData.wastageRisk || 'Not specified'}
Number of Menu Items: ${formData.numberOfMenuItems || 'Not specified'}
Packaging Type: ${formData.packagingType || 'Not specified'}
Activation Opportunities: ${activation}
Domestic Opportunities: ${domestic}
Retrofitting Needed: ${formData.retrofittingNeeded || 'Not specified'}
Multiple Deliveries: ${formData.multipleDeliveries || 'Not specified'}
Equipment Availability: ${formData.equipmentAvailability || 'Not specified'}
`

    const sectionBreakdown = `
Section Scores:
- Mapping: ${(section_scores.mapping.normalized * 100).toFixed(1)}%
- Operating: ${(section_scores.operating.normalized * 100).toFixed(1)}%
- Expansion: ${(section_scores.expansion.normalized * 100).toFixed(1)}%
- Special Conditions: ${(section_scores.special_conditions.normalized * 100).toFixed(1)}%
`

    const prompt = isApproved
      ? `
You are a professional business analyst for Skope Kitchens.

A brand scored ${total_score_0_to_10.toFixed(
          2
        )}/10 (above approval threshold ≥8.5).

${context}
${sectionBreakdown}

Write a 150–200 word summary that:
- Congratulates the brand
- Highlights strengths with specifics
- Reinforces alignment with Skope Kitchens
- Is warm, professional, and encouraging
- NO improvement suggestions (they are approved)

Write in second person (“Your brand…”, “You have…”).
`
      : `
You are a professional business analyst for Skope Kitchens.

A brand scored ${total_score_0_to_10.toFixed(
          2
        )}/10 (below threshold 8.5).

${context}
${sectionBreakdown}

Write a 150–200 word summary that:
- Acknowledges their effort
- Identifies exact improvement areas
- Provides constructive, actionable feedback
- Encourages them to resubmit
- NO harsh tone

Write in second person (“Your brand…”, “We noticed…”).
`

    // ---- FIXED GEMINI REQUEST ----
    const result = await model.generateContent([
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ]);


    const text = result.response.text().trim()

    if (!text) throw new Error('Gemini returned empty response')

    return text
  } catch (error) {
    console.error('Gemini API error:', error)

    // fallback text
    return isApproved
      ? `Your brand "${brand_name}" performed strongly with a score of ${total_score_0_to_10}/10, demonstrating excellent alignment with Skope Kitchens standards.`
      : `Your brand "${brand_name}" scored ${total_score_0_to_10}/10. Some areas require improvement before approval.`
  }
}
