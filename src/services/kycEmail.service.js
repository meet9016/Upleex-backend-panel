const nodemailer = require('nodemailer');
const config = require('../config/config');
const transporter = require('../config/email');
const KycNotification = require('../models/vendor/kycNotification.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');

// KYC Incomplete Reminder Email
const sendKycIncompleteEmail = async (to, vendorName, completedSteps, totalSteps, reminderStage) => {
  const stageMessages = {
    instant: 'We noticed you started your KYC verification but haven\'t completed it yet.',
    '24h': 'It\'s been 24 hours since you started your KYC verification.',
    '48h': 'It\'s been 48 hours since you started your KYC verification.',
    weekly: 'It\'s been a week since you started your KYC verification.',
    monthly: 'It\'s been a month since you started your KYC verification.',
    yearly: 'It\'s been a year since you started your KYC verification.'
  };

  const urgencyColors = {
    instant: '#f59e0b',
    '24h': '#f59e0b', 
    '48h': '#ef4444',
    weekly: '#ef4444',
    monthly: '#dc2626',
    yearly: '#991b1b'
  };

  const subject = `Complete Your KYC Verification - ${reminderStage === 'instant' ? 'Action Required' : 'Reminder'}`;

  const mailOptions = {
    from: `"Upleex" <${process.env.EMAIL_FROM || process.env.SMTP_USERNAME}>`,
    to,
    subject,
    html: `
<div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:20px auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <tr>
      <td style="background:#4F46E5; text-align:center; padding:35px 20px;">
        <h1 style="color:#fff; margin:10px 0 0; font-size:28px; font-weight:bold;">
          Complete Your KYC Verification
        </h1>
        <p style="color:#E0E7FF; margin:10px 0 0; font-size:16px;">Action Required</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:35px 30px; color:#333; font-size:15px; line-height:1.7;">
        <h2 style="margin:0 0 20px; color:#232323;">Hi ${vendorName}, 👋</h2>
        
        <p>${stageMessages[reminderStage]}</p>
        
        <!-- Progress Section -->
        <div style="margin:30px 0; padding:25px; background:#f8fafc; border-left:5px solid ${urgencyColors[reminderStage]}; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:${urgencyColors[reminderStage]};">
            📋 KYC Progress: ${completedSteps}/${totalSteps} Steps Completed
          </h3>
          
          <div style="background:#e2e8f0; height:10px; border-radius:5px; margin:15px 0;">
            <div style="background:${urgencyColors[reminderStage]}; height:10px; border-radius:5px; width:${(completedSteps/totalSteps)*100}%;"></div>
          </div>
          
          <p style="margin:15px 0 0; font-size:14px; color:#64748b;">
            Complete your KYC verification to start selling on Upleex platform.
          </p>
        </div>

        <!-- Steps Remaining -->
        <div style="margin:25px 0; padding:20px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:4px;">
          <h4 style="margin:0 0 10px; color:#92400e;">📝 Steps Remaining:</h4>
          <ul style="margin:0; color:#92400e; font-size:14px;">
            ${completedSteps < 1 ? '<li>Contact Details</li>' : ''}
            ${completedSteps < 2 ? '<li>Identity Verification</li>' : ''}
            ${completedSteps < 3 ? '<li>Bank Details</li>' : ''}
            ${completedSteps < 4 ? '<li>Document Upload</li>' : ''}
            ${completedSteps < 5 ? '<li>Terms & Conditions</li>' : ''}
          </ul>
        </div>

        <!-- CTA Button -->
        <div style="text-align:center; margin:30px 0;">
          <a href="${process.env.VENDOR_PANEL_URL || 'https://vendor.upleex.com'}/kyc" 
             style="display:inline-block; background:#4F46E5; color:#fff; padding:15px 30px; 
                    text-decoration:none; border-radius:8px; font-size:16px; font-weight:bold;">
            Complete KYC Now →
          </a>
        </div>

        <p style="margin:30px 0 10px; font-size:14px; color:#64748b;">
          Need help? Reply to this email or contact our support team.
        </p>

        <p style="margin-top:35px;">
          Best regards,<br>
          <strong>The Upleex Team</strong>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#4F46E5; padding:20px; text-align:center; color:#E0E7FF; font-size:13px;">
        © ${new Date().getFullYear()} Upleex. All rights reserved.
      </td>
    </tr>
  </table>
</div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Admin Approval Email
const sendKycApprovalEmail = async (to, vendorName) => {
  const subject = 'KYC Approved! Welcome to Upleex 🎉';

  const mailOptions = {
    from: `"Upleex" <${process.env.EMAIL_FROM || process.env.SMTP_USERNAME}>`,
    to,
    subject,
    html: `
<div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:20px auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <tr>
      <td style="background:#059669; text-align:center; padding:35px 20px;">
        <h1 style="color:#fff; margin:10px 0 0; font-size:28px; font-weight:bold;">
          KYC Approved! 🎉
        </h1>
        <p style="color:#a7f3d0; margin:10px 0 0; font-size:16px;">Welcome to Upleex</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:35px 30px; color:#333; font-size:15px; line-height:1.7;">
        <h2 style="margin:0 0 20px; color:#232323;">Congratulations ${vendorName}! 🎊</h2>
        
        <p>Your KYC verification has been <strong>approved</strong> by our admin team!</p>
        
        <!-- Success Section -->
        <div style="margin:30px 0; padding:25px; background:#f0fdf4; border-left:5px solid #059669; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#059669;">
            ✅ You're now a verified vendor on Upleex!
          </h3>
          
          <p style="margin:0; font-size:14px; color:#166534;">
            You can now start listing your products and services on our platform.
          </p>
        </div>

        <!-- Next Steps -->
        <div style="margin:25px 0; padding:20px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:4px;">
          <h4 style="margin:0 0 15px; color:#92400e;">🚀 What's Next?</h4>
          <ul style="margin:0; color:#92400e; font-size:14px; line-height:1.6;">
            <li>Set up your vendor profile</li>
            <li>Add your first products/services</li>
            <li>Configure your payment settings</li>
            <li>Start receiving orders</li>
          </ul>
        </div>

        <!-- CTA Button -->
        <div style="text-align:center; margin:30px 0;">
          <a href="${process.env.VENDOR_PANEL_URL || 'https://vendor.upleex.com'}" 
             style="display:inline-block; background:#059669; color:#fff; padding:15px 30px; 
                    text-decoration:none; border-radius:8px; font-size:16px; font-weight:bold;">
            Go to Dashboard →
          </a>
        </div>

        <p style="margin:30px 0 10px; font-size:14px; color:#64748b;">
          If you have any questions, feel free to contact our support team.
        </p>

        <p style="margin-top:35px;">
          Welcome aboard!<br>
          <strong>The Upleex Team</strong>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#059669; padding:20px; text-align:center; color:#a7f3d0; font-size:13px;">
        © ${new Date().getFullYear()} Upleex. All rights reserved.
      </td>
    </tr>
  </table>
</div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Admin Rejection Email
const sendKycRejectionEmail = async (to, vendorName, rejectionReason = '') => {
  const subject = 'KYC Verification - Action Required';

  const mailOptions = {
    from: `"Upleex" <${process.env.EMAIL_FROM || process.env.SMTP_USERNAME}>`,
    to,
    subject,
    html: `
<div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:20px auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <tr>
      <td style="background:#dc2626; text-align:center; padding:35px 20px;">
        <h1 style="color:#fff; margin:10px 0 0; font-size:28px; font-weight:bold;">
          KYC Verification Update
        </h1>
        <p style="color:#fecaca; margin:10px 0 0; font-size:16px;">Action Required</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:35px 30px; color:#333; font-size:15px; line-height:1.7;">
        <h2 style="margin:0 0 20px; color:#232323;">Hi ${vendorName}, 👋</h2>
        
        <p>We've reviewed your KYC verification documents and need some additional information or corrections.</p>
        
        <!-- Rejection Section -->
        <div style="margin:30px 0; padding:25px; background:#fef2f2; border-left:5px solid #dc2626; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#dc2626;">
            📋 Review Required
          </h3>
          
          ${rejectionReason ? `
          <div style="margin:15px 0; padding:15px; background:#fff; border-radius:6px; border:1px solid #fecaca;">
            <h4 style="margin:0 0 10px; color:#991b1b; font-size:14px;">Reason for Review:</h4>
            <p style="margin:0; color:#7f1d1d; font-size:14px;">${rejectionReason}</p>
          </div>
          ` : ''}
          
          <p style="margin:15px 0 0; font-size:14px; color:#7f1d1d;">
            Please review and update your KYC information to proceed with verification.
          </p>
        </div>

        <!-- Action Steps -->
        <div style="margin:25px 0; padding:20px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:4px;">
          <h4 style="margin:0 0 15px; color:#92400e;">🔄 What to do next:</h4>
          <ul style="margin:0; color:#92400e; font-size:14px; line-height:1.6;">
            <li>Review the feedback provided</li>
            <li>Update your KYC information</li>
            <li>Re-submit for verification</li>
            <li>Contact support if you need help</li>
          </ul>
        </div>

        <!-- CTA Button -->
        <div style="text-align:center; margin:30px 0;">
          <a href="${process.env.VENDOR_PANEL_URL || 'https://vendor.upleex.com'}/kyc" 
             style="display:inline-block; background:#dc2626; color:#fff; padding:15px 30px; 
                    text-decoration:none; border-radius:8px; font-size:16px; font-weight:bold;">
            Update KYC Information →
          </a>
        </div>

        <p style="margin:30px 0 10px; font-size:14px; color:#64748b;">
          Need assistance? Reply to this email or contact our support team.
        </p>

        <p style="margin-top:35px;">
          Best regards,<br>
          <strong>The Upleex Team</strong>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#dc2626; padding:20px; text-align:center; color:#fecaca; font-size:13px;">
        © ${new Date().getFullYear()} Upleex. All rights reserved.
      </td>
    </tr>
  </table>
</div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Schedule next reminder
const scheduleNextReminder = (currentStage) => {
  const scheduleMap = {
    instant: { next: '24h', hours: 24 },
    '24h': { next: '48h', hours: 48 },
    '48h': { next: 'weekly', hours: 168 }, // 7 days
    weekly: { next: 'monthly', hours: 720 }, // 30 days
    monthly: { next: 'yearly', hours: 8760 }, // 365 days
    yearly: { next: null, hours: 0 }
  };

  const schedule = scheduleMap[currentStage];
  if (!schedule || !schedule.next) return null;

  const nextReminderAt = new Date();
  nextReminderAt.setHours(nextReminderAt.getHours() + schedule.hours);

  return {
    nextStage: schedule.next,
    nextReminderAt
  };
};

// Create or update KYC notification
const createKycNotification = async (vendorId, email, kycId, notificationType, reminderStage = 'instant', completedSteps = 0) => {
  try {
    const nextReminder = scheduleNextReminder(reminderStage);
    
    const notification = await KycNotification.findOneAndUpdate(
      { vendor_id: vendorId, notification_type: notificationType },
      {
        email,
        kyc_id: kycId,
        reminder_stage: reminderStage,
        sent_at: new Date(),
        next_reminder_at: nextReminder?.nextReminderAt || null,
        is_active: notificationType === 'kyc_incomplete' && completedSteps < 5,
        completed_steps: completedSteps,
        total_steps: 5
      },
      { upsert: true, new: true }
    );

    return notification;
  } catch (error) {
    console.error('Error creating KYC notification:', error);
    throw error;
  }
};

// Process KYC incomplete notifications
const processKycIncompleteNotifications = async () => {
  try {
    const now = new Date();
    const notifications = await KycNotification.find({
      notification_type: 'kyc_incomplete',
      is_active: true,
      next_reminder_at: { $lte: now }
    });

    for (const notification of notifications) {
      try {
        // Get latest KYC data
        const kycData = await VendorKyc.findById(notification.kyc_id);
        if (!kycData) continue;

        const completedSteps = kycData.completed_pages?.length || 0;
        
        // If KYC is completed, deactivate notification
        if (completedSteps >= 5 || kycData.status === 'approved') {
          notification.is_active = false;
          await notification.save();
          continue;
        }

        // Send reminder email
        const vendorName = kycData.ContactDetails?.full_name || 'Vendor';
        await sendKycIncompleteEmail(
          notification.email,
          vendorName,
          completedSteps,
          5,
          notification.reminder_stage
        );

        // Schedule next reminder
        const nextReminder = scheduleNextReminder(notification.reminder_stage);
        if (nextReminder) {
          notification.reminder_stage = nextReminder.nextStage;
          notification.next_reminder_at = nextReminder.nextReminderAt;
          notification.sent_at = new Date();
        } else {
          notification.is_active = false;
        }

        await notification.save();
      } catch (error) {
        console.error(`Error processing notification ${notification._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error processing KYC incomplete notifications:', error);
  }
};

module.exports = {
  sendKycIncompleteEmail,
  sendKycApprovalEmail,
  sendKycRejectionEmail,
  createKycNotification,
  processKycIncompleteNotifications,
  scheduleNextReminder
};