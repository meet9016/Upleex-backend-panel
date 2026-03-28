const transporter = require('../config/email');

// Email when admin approves/rejects product
const sendProductApprovalEmail = async (to, vendorName, productName, status, from, reason = '') => {
  try {
    console.log(`\n========== EMAIL SENDING START =========`);
    console.log(`To: ${to}`);
    console.log(`Vendor: ${vendorName}`);
    console.log(`Product: ${productName}`);
    console.log(`Status: ${status}`);
    console.log(`Reason: ${reason}`);
    console.log(from)
    const isApproved = status.toLowerCase() === 'approved';
    const subject = isApproved
      ? `✅ Your Product "${productName}" Has Been Approved!`
      : `Product Review: "${productName}" - Action Required`;

    const headerBg = isApproved ? '#059669' : '#dc2626';
    const headerText = isApproved ? 'Product Approved! 🎉' : 'Product Rejected ⚠️';
    const statusColor = isApproved ? '#d1fae5' : '#fee2e2';
    const statusBg = isApproved ? '#f0fdf4' : '#fef2f2';
    const statusBorder = isApproved ? '#059669' : '#dc2626';
    const statusTextColor = isApproved ? '#166534' : '#991b1b';
    const icon = isApproved ? '✅' : '❌';

    const mailOptions = {
      from: `"Upleex" <${process.env.EMAIL_FROM || process.env.SMTP_USERNAME}>`,
      to,
      subject,
      html: `
<div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:20px auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <tr>
      <td style="background:${headerBg}; text-align:center; padding:35px 20px;">
        <h1 style="color:#fff; margin:0; font-size:24px; font-weight:bold;">
          ${icon} ${headerText}
        </h1>
        <p style="color:${statusColor}; margin:10px 0 0; font-size:14px;">Product review completed</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:35px 30px; color:#333; font-size:15px; line-height:1.7;">
        <h2 style="margin:0 0 20px; color:#232323;">Hi ${vendorName}, 👋</h2>
        
        <p>
          Your product <strong>"${productName}"</strong> has been reviewed by our admin team and the decision is below.
        </p>

        <!-- Status Details -->
        <div style="margin:30px 0; padding:20px; background:${statusBg}; border-left:5px solid ${statusBorder}; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:${statusTextColor};">📋 Review Status</h3>
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Vendor Email:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #232323;">${to}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Product Name:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #232323;"><strong>${productName}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Status:</strong></td>
              <td style="padding: 8px 0; text-align: right;">
                <span style="background: ${statusColor}; color: ${statusTextColor}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                  ${status.toUpperCase()}
                </span>
              </td>
            </tr>
            ${reason ? `
            <tr>
              <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Reason:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #232323;">${reason}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${isApproved ? `
        <!-- Approved Message -->
        <div style="margin:30px 0; padding:20px; background:#f0fdf4; border-left:5px solid #059669; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#166534;">🎉 Congratulations!</h3>
          <p style="margin:0; color:#166534; font-size:14px;">
            Your product <strong>"${productName}"</strong> has been approved and is now live on Upleex. Customers can now view and request quotes for your product.
          </p>
        </div>

        <!-- Next Steps -->
        <div style="margin:30px 0; padding:20px; background:#eff6ff; border-left:5px solid #3b82f6; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#1e40af;">📌 Next Steps</h3>
          <ul style="margin:0; padding-left:20px; color:#1e40af; font-size:14px;">
            <li style="margin:8px 0;">Monitor customer quotes in your dashboard</li>
            <li style="margin:8px 0;">Respond to quotes promptly</li>
            <li style="margin:8px 0;">Keep inventory updated</li>
          </ul>
        </div>
        ` : `
        <!-- Rejection Message -->
        <div style="margin:30px 0; padding:20px; background:#fef2f2; border-left:5px solid #dc2626; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#991b1b;">⚠️ Product Rejected</h3>
          <p style="margin:0; color:#991b1b; font-size:14px;">
            Your product <strong>"${productName}"</strong> did not meet our quality standards or guidelines. Please review the reason above and make necessary corrections before resubmitting.
          </p>
        </div>

        <!-- What to Do -->
        <div style="margin:30px 0; padding:20px; background:#fef3c7; border-left:5px solid #f59e0b; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#92400e;">📝 What to Do Next</h3>
          <ul style="margin:0; padding-left:20px; color:#92400e; font-size:14px;">
            <li style="margin:8px 0;">Review the rejection reason carefully</li>
            <li style="margin:8px 0;">Make necessary corrections to your product</li>
            <li style="margin:8px 0;">Resubmit your product for approval</li>
            <li style="margin:8px 0;">Contact support if you need clarification</li>
          </ul>
        </div>
        `}

        <p style="margin:30px 0 10px;">
          If you have any questions, please don't hesitate to contact our support team.
        </p>

        <p style="margin-top:35px;">
          Best regards,<br>
          <strong>The Upleex Team</strong>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#232323; padding:20px; text-align:center; color:#fff; font-size:13px;">
        © ${new Date().getFullYear()} Upleex. All rights reserved.
      </td>
    </tr>
  </table>
</div>
    `,
    };

    console.log(`Sending email with subject: ${subject}`);
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to: ${to}`);
    console.log(`Response: ${result.response}`);
    console.log(`========== EMAIL SENDING END =========\n`);
    return result;
  } catch (error) {
    console.error(`\n❌ EMAIL SENDING FAILED TO: ${to}`);
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error(`========== EMAIL SENDING END =========\n`);
    throw error;
  }
};

module.exports = {
  sendProductApprovalEmail,
};
