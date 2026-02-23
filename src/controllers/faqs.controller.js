const httpStatus = require('http-status');

const getAllFaqs = {
  handler: async (req, res) => {
    try {
      const faqs = [
        {
          id: '9',
          question: 'What if my KYC verification fails?',
          answer:
            'If KYC verification fails, our team will contact you to request additional documents or clarify the issue. Your order will be processed once KYC is approved.',
        },
        {
          id: '8',
          question: ' What happens if I return the product early?',
          answer:
            'Early returns are possible. However, the rental charges may be recalculated based on the actual tenure of usage.',
        },
        {
          id: '7',
          question: 'Can I cancel my rental order?',
          answer:
            'Yes, you can cancel your rental order before delivery. Cancellation policies may apply based on the timing of your request.',
        },
        {
          id: '6',
          question: 'What things can I Rent from Upleex?',
          answer:
            "You can rent furniture, home appliances, electronics, fitness equipment, laptops, and more.",
        },
        {
          id: '5',
          question:
            'How to Take a Product on rent (Take On Rent) from Upleex?',
          answer:
            'You can rent products by visiting our website or app, selecting the desired category, choosing the product, completing the KYC process, and making the payment.',
        },
        {
          id: '4',
          question: ' How does Upleex work?',
          answer:
            "Simply browse our catalog, select the products you need, choose your rental tenure, and place an order. We'll deliver and install the products at your doorstep.",
        },
        {
          id: '3',
          question: 'Why Upleex?',
          answer:
            'Upleex offers a wide range of premium products at affordable rental rates. We ensure quality checks, free maintenance, and flexible tenure options to suit your needs.',
        },
        {
          id: '2',
          question: 'Can I cancel my uplix order?',
          answer:
            'If delivery is scheduled more than 48 hours later – Full refund (minus 2%–5% transaction fee).',
        },
      ];

      res.status(httpStatus.OK).json({
        status: 1,
        message: 'FAQ list fetched successfully',
        data: faqs,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

module.exports = {
  getAllFaqs,
};

