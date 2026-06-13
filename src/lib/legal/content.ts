export type LegalPageSlug = 'terms' | 'privacy' | 'refund-policy' | 'contact';

export type LegalSection = { heading: string; body: string[]; bullets?: string[] };

export type LegalPageContent = {
  slug: LegalPageSlug;
  title: string;
  eyebrow: string;
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export const legalPages: LegalPageContent[] = [
  {
    slug: 'terms',
    title: 'Terms of Use',
    eyebrow: 'Pacific Drone legal',
    summary:
      'These terms explain the rules for using Pacific Drone courses, accounts, services, and related training materials.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Important note',
        body: [
          'These terms are provided for transparency and should be reviewed by qualified legal counsel before they are relied on as final legal documents.',
          'By accessing Pacific Drone courses, websites, accounts, or services, you agree to follow these terms and any course or product terms shown at purchase.',
        ],
      },
      {
        heading: 'Company and contact',
        body: [
          'Pacific Drone provides online and related drone training services in Canada.',
          'Questions about these terms may be sent to info@pacificdrone.ca.',
        ],
      },
      {
        heading: 'Eligibility and accounts',
        body: [
          'You are responsible for providing accurate account information and keeping your sign-in credentials secure.',
          'You must be old enough to form a binding agreement in your jurisdiction, or have permission from a parent or legal guardian.',
        ],
      },
      {
        heading: 'Account sharing ban',
        body: [
          'Accounts are for individual use only unless Pacific Drone gives written permission for another arrangement.',
          'You may not share, sell, transfer, publish, or otherwise provide account access, course access, or login credentials to another person.',
        ],
      },
      {
        heading: 'Course access license',
        body: [
          'When you purchase or receive access to a course, you receive a limited, personal, non-transferable license to view and use the course for your own training.',
          'Course access is not a sale or transfer of ownership in any course, video, document, quiz, download, brand, software, or other content.',
        ],
      },
      {
        heading: 'Ongoing access boundaries',
        body: [
          'Course access is ongoing while the course remains commercially available and your account is in good standing.',
          'Access may change or end if a course is retired, replaced, removed for legal or operational reasons, or if your account is suspended or closed under these terms.',
        ],
      },
      {
        heading: 'Payments, taxes, pricing, and promotions',
        body: [
          'Prices, promotions, discounts, taxes, and availability may vary and may change without notice before purchase.',
          'You are responsible for applicable taxes, fees, and charges shown at checkout or required by law.',
          'Promotional pricing, coupons, bundles, and limited offers may have additional terms and may not be combined unless stated.',
        ],
      },
      {
        heading: 'Course updates and content removal',
        body: [
          'Pacific Drone may update, correct, replace, reorganize, or remove course content to improve training, address regulatory changes, or manage business needs.',
          'We do not guarantee that any specific lesson, feature, instructor, document, or format will remain available indefinitely.',
        ],
      },
      {
        heading: 'Training results disclaimer',
        body: [
          'Pacific Drone provides training and educational materials, but does not guarantee that you will pass an exam, obtain certification, secure employment, earn income, or remain compliant with any law or regulation.',
          'You are responsible for confirming current regulatory requirements and applying training appropriately to your own operations.',
        ],
      },
      {
        heading: 'User conduct',
        body: [
          'You agree to use Pacific Drone services lawfully, respectfully, and only for their intended training purposes.',
          'You may not interfere with the platform, attempt unauthorized access, submit harmful code, harass others, or use the services in a way that damages Pacific Drone or other users.',
        ],
      },
      {
        heading: 'Intellectual property restrictions',
        body: [
          'Pacific Drone and its licensors retain all rights in course materials, videos, text, graphics, downloads, trademarks, platform content, and related intellectual property.',
          'You may not copy, record, scrape, redistribute, resell, publicly display, create derivative works from, or use course content to train competing products or services without written permission.',
        ],
      },
      {
        heading: 'Third-party services',
        body: [
          'Pacific Drone may rely on third-party services for hosting, payments, analytics, communication, scheduling, video delivery, support, and other business operations.',
          'Third-party services are governed by their own terms and policies, and Pacific Drone is not responsible for third-party systems outside its control.',
        ],
      },
      {
        heading: 'Suspension and termination',
        body: [
          'Pacific Drone may suspend or terminate access if you violate these terms, create risk for the service, misuse content, fail to pay required amounts, or engage in unlawful or harmful conduct.',
          'Suspension or termination may limit access to courses, account features, certificates of completion, and related services.',
        ],
      },
      {
        heading: 'No warranty and liability limitation',
        body: [
          'Pacific Drone services and content are provided on an as-is and as-available basis to the fullest extent permitted by law.',
          'Pacific Drone does not warrant that the services will be uninterrupted, error-free, current for every use case, or suitable for any specific operational decision.',
          'To the fullest extent permitted by law, Pacific Drone will not be liable for indirect, incidental, consequential, special, punitive, or lost-profit damages arising from your use of the services.',
        ],
      },
      {
        heading: 'Indemnity, force majeure, and disputes',
        body: [
          'You agree to indemnify Pacific Drone against claims, losses, liabilities, costs, and expenses arising from your misuse of the services, violation of these terms, or unlawful conduct.',
          'Pacific Drone is not responsible for delay or failure caused by events beyond reasonable control, including outages, labour disruptions, payment processor issues, emergencies, regulatory changes, or natural events.',
          'These terms are governed by the laws of British Columbia and applicable federal laws of Canada. Disputes will be handled in the courts or tribunals located in British Columbia unless applicable law requires otherwise.',
        ],
      },
      {
        heading: 'Course and product terms',
        body: [
          'Specific courses, flight reviews, bundles, coaching sessions, or products may include additional eligibility, scheduling, technical, completion, or refund terms.',
          'If additional product terms conflict with these general terms, the product terms apply only for that specific product or service.',
        ],
      },
      {
        heading: 'Terms changes',
        body: [
          'Pacific Drone may update these terms from time to time by posting a revised version with a new last updated date.',
          'Continued use of the services after changes are posted means you accept the revised terms for future use.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    eyebrow: 'Privacy and data',
    summary:
      'This policy explains how Pacific Drone collects, uses, shares, protects, and retains personal information.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Important note',
        body: [
          'This policy is written for a North American training site and should be reviewed by qualified privacy or legal counsel before final publication.',
          'It explains Pacific Drone privacy practices in practical terms and does not limit rights that cannot be limited under applicable law.',
        ],
      },
      {
        heading: 'Responsible business',
        body: [
          'Pacific Drone is responsible for personal information under its control.',
          'Privacy questions or requests may be sent to info@pacificdrone.ca.',
        ],
      },
      {
        heading: 'Data collected',
        body: ['Pacific Drone may collect information needed to provide training, operate accounts, process purchases, and improve services.'],
        bullets: [
          'Contact details such as name, email address, phone number, and billing information.',
          'Account details such as username, password status, course enrollments, progress, quiz results, completions, and support history.',
          'Purchase details such as products ordered, transaction records, refund status, tax information, and payment confirmation details.',
          'Technical details such as IP address, browser, device, operating system, pages viewed, referring pages, approximate location, cookie identifiers, and usage logs.',
          'Communications you send to Pacific Drone, including support requests, scheduling information, feedback, and legal notices.',
        ],
      },
      {
        heading: 'Use purposes',
        body: ['Pacific Drone uses personal information for business and training purposes.'],
        bullets: [
          'Create, secure, and manage accounts.',
          'Deliver courses, track progress, provide support, and administer certificates or completion records.',
          'Process payments, taxes, refunds, chargebacks, and accounting records.',
          'Send service messages, policy updates, purchase confirmations, scheduling details, and support responses.',
          'Improve course content, platform performance, security, analytics, marketing, and customer experience.',
          'Meet legal, regulatory, tax, fraud prevention, dispute resolution, and enforcement obligations.',
        ],
      },
      {
        heading: 'Third-party providers',
        body: [
          'Pacific Drone may share personal information with service providers that help operate the business, including hosting, payment, analytics, email, scheduling, customer support, video delivery, security, accounting, and advertising providers.',
          'Service providers are expected to use information only for the services they provide to Pacific Drone, subject to their own legal obligations and policies.',
        ],
      },
      {
        heading: 'Payment processor and card numbers',
        body: [
          'Payments are handled through third-party processors such as Stripe.',
          'Pacific Drone does not store full payment card numbers on its own systems. Payment processors may collect, process, and store payment details under their own terms and privacy policies.',
        ],
      },
      {
        heading: 'Cookies, analytics, ads, and consent',
        body: [
          'Pacific Drone may use cookies, analytics tools, advertising pixels, and similar technologies to operate the site, remember preferences, measure performance, understand usage, and support marketing.',
          'Where required, Pacific Drone will request consent before using non-essential cookies or similar technologies.',
          'You may withdraw consent, adjust browser settings, use available cookie controls, or opt out through supported analytics or advertising controls. Some features may not work properly if cookies are disabled.',
        ],
      },
      {
        heading: 'Cross-border processing',
        body: [
          'Personal information may be processed or stored in Canada, the United States, or other jurisdictions where Pacific Drone or its service providers operate.',
          'Information handled outside your province, state, or country may be subject to the laws of that jurisdiction.',
        ],
      },
      {
        heading: 'Retention',
        body: [
          'Pacific Drone keeps personal information only as long as reasonably needed for the purposes described in this policy, including training records, support, accounting, tax, legal, security, and dispute needs.',
          'Retention periods may vary by record type, legal obligation, and business need.',
        ],
      },
      {
        heading: 'User rights',
        body: [
          'Depending on your location, you may have rights to access, correct, delete, restrict, object to, or receive a copy of certain personal information.',
          'You may contact info@pacificdrone.ca to make a privacy request. Pacific Drone may need to verify your identity before responding.',
        ],
      },
      {
        heading: 'Marketing unsubscribe',
        body: [
          'You may unsubscribe from marketing emails by using the unsubscribe link in the email or by contacting Pacific Drone.',
          'Pacific Drone may still send transactional or service messages related to your account, purchases, training, support, or legal notices.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Pacific Drone uses reasonable administrative, technical, and organizational safeguards intended to protect personal information.',
          'No website, platform, email, or storage system can be guaranteed completely secure.',
        ],
      },
      {
        heading: 'Breach response',
        body: [
          'If Pacific Drone becomes aware of a privacy or security incident involving personal information, it will assess the incident and take steps that are reasonable in the circumstances.',
          'Where required by law, Pacific Drone will notify affected individuals, regulators, or other required parties.',
        ],
      },
      {
        heading: 'Minors',
        body: [
          'Pacific Drone services are not intended for children to use without appropriate parent or guardian involvement.',
          'If you believe a minor has provided personal information without appropriate permission, contact info@pacificdrone.ca.',
        ],
      },
    ],
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    eyebrow: 'Purchases and refunds',
    summary:
      'This policy explains refund eligibility for Pacific Drone courses, flight reviews, and related purchases.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Important note',
        body: [
          'This refund policy should be reviewed by qualified legal counsel before publication as final business policy.',
          'Pacific Drone may update this policy for future purchases, but the policy shown at the time of purchase will generally apply to that purchase unless law requires otherwise.',
        ],
      },
      {
        heading: 'How to request a refund',
        body: [
          'To request a refund, email info@pacificdrone.ca with your name, account email, order details, and the reason for the request.',
          'Pacific Drone may ask for additional information needed to confirm the purchase and evaluate eligibility.',
        ],
      },
      {
        heading: 'Standard 14-day course refund rule',
        body: [
          'For eligible course purchases, you may request a refund within 14 days from the purchase date.',
          'A purchase is not eligible for refund if more than 20% of the course content has been accessed or viewed.',
        ],
      },
      {
        heading: 'Course progress cutoff',
        body: [
          'Pacific Drone may use platform records, video activity, lesson status, quiz activity, download activity, or other account data to determine whether more than 20% of course content has been accessed or viewed.',
          'If the 20% cutoff has been exceeded, the course purchase is not refundable except where required by law or approved by Pacific Drone as a special circumstance.',
        ],
      },
      {
        heading: 'Flight review refunds',
        body: [
          'Flight reviews are non-refundable within 48 hours of the scheduled review.',
          'More than 48 hours before the scheduled review, a flight review is refundable minus 50% of the flight review fee.',
          'Missed appointments, late arrivals, failure to meet eligibility requirements, or failure to bring required materials may be treated as non-refundable unless Pacific Drone approves another outcome.',
        ],
      },
      {
        heading: 'Non-refundable cases',
        body: ['Refunds are not available in the following cases unless required by law or approved by Pacific Drone in writing.'],
        bullets: [
          'The refund request is made more than 14 days after the purchase date for an eligible course.',
          'More than 20% of course content has been accessed or viewed.',
          'The product, service, bundle, promotion, or event was clearly marked non-refundable at purchase.',
          'The account was suspended or terminated for misuse, account sharing, unlawful conduct, chargeback abuse, or violation of terms.',
          'The request is based on not passing an exam, not obtaining certification, not gaining employment, not earning income, or not achieving operational compliance.',
          'The request concerns third-party fees, bank fees, currency conversion differences, or taxes that cannot be recovered.',
        ],
      },
      {
        heading: 'Processing and payment method',
        body: [
          'Approved refunds are normally returned to the original payment method through the applicable third-party payment processor.',
          'Processing times depend on the payment processor, card network, bank, and payment method. Pacific Drone cannot guarantee the date funds will appear in your account.',
        ],
      },
      {
        heading: 'Chargebacks',
        body: [
          'Please contact Pacific Drone at info@pacificdrone.ca before starting a chargeback so the issue can be reviewed directly.',
          'Pacific Drone may dispute chargebacks it believes are invalid, fraudulent, inconsistent with this policy, or related to services that were delivered as purchased.',
        ],
      },
      {
        heading: 'Special circumstances',
        body: [
          'Pacific Drone may consider special circumstances such as duplicate purchases, payment errors, serious illness, emergency situations, or other unusual facts.',
          'Special circumstance refunds are discretionary unless required by law and may require supporting information.',
        ],
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact',
    eyebrow: 'Contact and notices',
    summary:
      'Use this page to contact Pacific Drone for support, privacy requests, refund requests, and legal notices.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Contact email',
        body: [
          'You can contact Pacific Drone at info@pacificdrone.ca.',
          'Please include your name, account email, order details if relevant, and a clear description of your request.',
        ],
      },
      {
        heading: 'Legal notices',
        body: [
          'Legal notices should be sent to info@pacificdrone.ca with enough detail for Pacific Drone to identify the issue, account, transaction, or content involved.',
          'Sending a notice by email does not guarantee that email notice is legally sufficient for every type of claim, deadline, or legal process.',
        ],
      },
      {
        heading: 'Support scope',
        body: [
          'Pacific Drone can help with account access, course access, payment questions, refund requests, scheduling questions, and general training support.',
          'Support responses may depend on account status, product terms, available records, and the nature of the request.',
        ],
      },
      {
        heading: 'No legal, emergency, or operational authorization advice',
        body: [
          'Pacific Drone does not provide legal advice, emergency response services, air traffic authorization, operational approval, or site-specific permission to fly.',
          'For emergencies, contact the appropriate emergency services. For legal, regulatory, or operational authorization questions, consult the appropriate regulator, authority, or qualified professional.',
        ],
      },
      {
        heading: 'Regulatory disclaimer',
        body: [
          'Drone rules, procedures, and regulator guidance may change.',
          'Pacific Drone training is educational and does not replace your responsibility to verify current requirements, comply with applicable laws, and operate safely.',
        ],
      },
      {
        heading: 'Related policy links',
        body: [
          'Related pages include the Terms of Use, Privacy Policy, and Refund Policy.',
          'Those pages explain account rules, data practices, refund eligibility, course access, and other important conditions for using Pacific Drone services.',
        ],
      },
    ],
  },
];

export function getLegalPage(slug: LegalPageSlug): LegalPageContent {
  return legalPages.find((page) => page.slug === slug)!;
}
