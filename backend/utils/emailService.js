import dotenv from 'dotenv'

dotenv.config()

const {
  SENDGRID_API_KEY,
  SENDGRID_TEMPLATE_ID,
  EMAIL_FROM,
  SENDGRID_FROM_NAME,
  INTERNAL_ELIGIBILITY_EMAIL,
} = process.env

const DEFAULT_INTERNAL_EMAIL = 'sanjuktha@skopekitchens.com'

// Warn early if missing config
if (!SENDGRID_API_KEY) console.warn('❌ SENDGRID_API_KEY missing – emails disabled')
if (!SENDGRID_TEMPLATE_ID) console.warn('❌ SENDGRID_TEMPLATE_ID missing – emails disabled')

/**
 * Low-level SendGrid sender
 */
const sendViaSendGrid = async ({ to, dynamicData }) => {
  if (!SENDGRID_API_KEY || !SENDGRID_TEMPLATE_ID) return
  if (!to) return

  const fromEmail = EMAIL_FROM || 'no-reply@skopekitchens.com'
  const fromName = SENDGRID_FROM_NAME || 'Skope Kitchens'

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
            dynamic_template_data: dynamicData,
          },
        ],
        from: { email: fromEmail, name: fromName },
        template_id: SENDGRID_TEMPLATE_ID,
      }),
    })

    if (res.status !== 202) {
      console.error(
        'SendGrid failed:',
        res.status,
        await res.text().catch(() => '')
      )
    } else {
      console.log('📧 Email sent →', to)
    }
  } catch (err) {
    console.error('SendGrid error:', err)
  }
}

/**
 * Public API – called by controller
 */
export const sendEligibilityEmails = async ({
  submission,
  scoreResult,
  aiAnalysisSummary,
  attachments = []
}) => {
  if (!submission) {
    console.warn('⚠️ submission missing in sendEligibilityEmails()')
    return
  }

  const userEmail = submission.submittedByEmail
  const internalEmail = INTERNAL_ELIGIBILITY_EMAIL || DEFAULT_INTERNAL_EMAIL

  const { total_score_0_to_10 = 0, decision, section_scores = {} } =
    scoreResult || {}

  const decisionLabel =
    decision === 'MOVE_FORWARD' ? 'Approved' : 'Needs Review'

  const t = (v) =>
    Array.isArray(v)
      ? v.join(', ')
      : v === undefined || v === null || v === ''
      ? 'Not provided'
      : String(v)

  const attachmentsHtml =
    attachments.length > 0
      ? attachments
          .map(
            (url) =>
              `<li><a href="${url}" target="_blank">${url}</a></li>`
          )
          .join('')
      : '<li>No attachments provided</li>'

  const dynamicTemplateData = {
    submittedBy: submission.submittedByEmail,
    brandName: submission.brandName || 'Unknown Brand',
    overallScore: total_score_0_to_10.toFixed(2),
    decision: decisionLabel,
    aiAnalysisSummary,

    mappingScore: ((section_scores?.mapping?.normalized || 0) * 100).toFixed(1),
    operatingScore: ((section_scores?.operating?.normalized || 0) * 100).toFixed(1),
    expansionScore: ((section_scores?.expansion?.normalized || 0) * 100).toFixed(1),
    specialScore: ((section_scores?.special_conditions?.normalized || 0) * 100).toFixed(1),

    locationMapping: t(submission.locationMapping),
    brandStrength: t(submission.brandStrength),
    socialMedia: t(submission.socialMediaEngagement),
    swiggyRating: t(submission.swiggyRating),
    zomatoRating: t(submission.zomatoRating),
    dspRate: t(submission.dspRatePercent),
    dspRateType: t(submission.dspRateType),
    dailySales: t(submission.bmDeliverySales),
    deliveryAov: t(submission.deliveryAOV),
    cogs: t(submission.cogsAnalysis),
    menuItems: t(submission.numberOfMenuItems),
    packagingType: t(submission.packagingType),

    activationOpportunities: t(submission.activationOpportunities),
    domesticOpportunities: t(submission.domesticOpportunities),
    marketingCommitment: t(submission.dspMarketingCommitment),

    attachmentsHtml
  }

  if (userEmail) {
    await sendViaSendGrid({ to: userEmail, dynamicData: dynamicTemplateData })
  }

  await sendViaSendGrid({
    to: internalEmail,
    dynamicData: dynamicTemplateData,
  })
}

