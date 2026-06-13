export type LegalPageSlug = 'terms' | 'privacy' | 'refund-policy' | 'contact';
export type LegalLocale = 'en' | 'zh';

export type LegalSection = { heading: string; body: string[]; bullets?: string[] };

export type LegalPageContent = {
  slug: LegalPageSlug;
  title: string;
  eyebrow: string;
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

type LocalizedLegalPage = Record<LegalLocale, LegalPageContent>;

const legalPages: Record<LegalPageSlug, LocalizedLegalPage> = {
  terms: {
    en: {
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
    zh: {
      slug: 'terms',
      title: '使用条款',
      eyebrow: 'Pacific Drone 法律条款',
      summary: '本条款说明使用 Pacific Drone 课程、账号、服务及相关培训材料时适用的规则。',
      lastUpdated: '2026 年 6 月 13 日',
      sections: [
        {
          heading: '重要说明',
          body: [
            '本条款用于提高透明度，作为业务草稿提供；在作为正式法律文件使用前，建议由具备资质的法律顾问审核。',
            '访问或使用 Pacific Drone 的课程、网站、账号或服务，即表示你同意遵守本条款，以及购买时显示的任何课程或产品条款。',
          ],
        },
        {
          heading: '公司与联系方式',
          body: [
            'Pacific Drone 在加拿大提供线上及相关无人机培训服务。',
            '如对本条款有疑问，可发送邮件至 info@pacificdrone.ca。',
          ],
        },
        {
          heading: '用户资格与账号',
          body: [
            '你有责任提供准确的账号信息，并妥善保管登录凭据。',
            '你必须达到所在司法辖区可签订有约束力协议的年龄，或已获得父母或法定监护人的许可。',
          ],
        },
        {
          heading: '禁止账号共享',
          body: [
            '除非 Pacific Drone 另行书面同意，账号仅供个人使用。',
            '你不得与他人共享、出售、转让、发布或以其他方式提供账号访问权限、课程访问权限或登录凭据。',
          ],
        },
        {
          heading: '课程访问许可',
          body: [
            '当你购买或获得课程访问权限时，你取得的是有限的、个人的、不可转让的课程查看和学习许可。',
            '课程访问权限并不代表 Pacific Drone 向你出售或转让任何课程、视频、文件、测验、下载资料、品牌、软件或其他内容的所有权。',
          ],
        },
        {
          heading: '持续访问的边界',
          body: [
            '只要课程仍由 Pacific Drone 商业提供，且你的账号状态良好，你可以持续访问已获得权限的课程。',
            '如果课程因法律、监管、运营原因被退役、替换或移除，或你的账号因本条款被暂停或关闭，访问权限可能发生变化或终止。',
          ],
        },
        {
          heading: '付款、税费、价格与促销',
          body: [
            '价格、促销、折扣、税费和可用性可能变化，并可能在购买前不另行通知地调整。',
            '你有责任支付结账页面显示或法律要求的适用税费、费用和收费。',
            '促销价格、优惠码、套餐和限时优惠可能附带额外条款，除非另有说明，不可叠加使用。',
          ],
        },
        {
          heading: '课程更新与内容下架',
          body: [
            'Pacific Drone 可能为了改进培训、应对监管变化或满足业务需要，对课程内容进行更新、修正、替换、重组或移除。',
            '我们不保证任何特定课程、功能、讲师、文件或格式会永久保持可用。',
          ],
        },
        {
          heading: '培训结果免责声明',
          body: [
            'Pacific Drone 提供培训和教育材料，但不保证你一定通过考试、取得证书、获得工作、获得收入，或在任何法律法规下保持合规。',
            '你有责任确认当前监管要求，并根据自身运营情况正确应用培训内容。',
          ],
        },
        {
          heading: '用户行为规范',
          body: [
            '你同意以合法、尊重他人且符合培训目的的方式使用 Pacific Drone 服务。',
            '你不得干扰平台、尝试未经授权的访问、提交有害代码、骚扰他人，或以损害 Pacific Drone 或其他用户的方式使用服务。',
          ],
        },
        {
          heading: '知识产权限制',
          body: [
            'Pacific Drone 及其许可方保留课程材料、视频、文字、图形、下载资料、商标、平台内容及相关知识产权的全部权利。',
            '未经书面许可，你不得复制、录制、抓取、再分发、转售、公开展示、创作衍生作品，或使用课程内容训练竞争性产品或服务。',
          ],
        },
        {
          heading: '第三方服务',
          body: [
            'Pacific Drone 可能依赖第三方服务提供托管、付款、分析、通信、预约、视频传输、支持和其他业务运营功能。',
            '第三方服务受其自身条款和政策约束；对于不受 Pacific Drone 控制的第三方系统，Pacific Drone 不承担责任。',
          ],
        },
        {
          heading: '暂停与终止',
          body: [
            '如果你违反本条款、给服务造成风险、滥用内容、未支付应付款项，或从事违法或有害行为，Pacific Drone 可以暂停或终止你的访问权限。',
            '暂停或终止可能限制你访问课程、账号功能、结业证明及相关服务。',
          ],
        },
        {
          heading: '无担保与责任限制',
          body: [
            '在法律允许的最大范围内，Pacific Drone 的服务和内容按现状及可用状态提供。',
            'Pacific Drone 不保证服务不会中断、没有错误、适用于每一种用途，或适合任何特定运营决策。',
            '在法律允许的最大范围内，Pacific Drone 不对因使用服务产生的间接、附带、后果性、特殊、惩罚性或利润损失承担责任。',
          ],
        },
        {
          heading: '赔偿、不可抗力与争议',
          body: [
            '如因你滥用服务、违反本条款或违法行为导致任何索赔、损失、责任、费用或支出，你同意向 Pacific Drone 作出赔偿。',
            '对于超出合理控制范围的事件造成的延迟或无法履行，Pacific Drone 不承担责任，包括服务中断、劳资问题、支付处理商问题、紧急事件、监管变化或自然事件。',
            '本条款受不列颠哥伦比亚省法律及适用的加拿大联邦法律管辖。除非适用法律另有要求，争议将在不列颠哥伦比亚省的法院或相关机构处理。',
          ],
        },
        {
          heading: '课程与产品条款',
          body: [
            '特定课程、飞行评估、套餐、辅导课程或产品可能包含额外的资格、预约、技术、完成或退款条款。',
            '如额外产品条款与本通用条款冲突，该产品条款仅适用于对应的特定产品或服务。',
          ],
        },
        {
          heading: '条款变更',
          body: [
            'Pacific Drone 可以不时更新本条款，并发布带有新更新时间的修订版本。',
            '修订条款发布后继续使用服务，即表示你接受修订后的条款适用于后续使用。',
          ],
        },
      ],
    },
  },
  privacy: {
    en: {
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
    zh: {
      slug: 'privacy',
      title: '隐私政策',
      eyebrow: '隐私与数据',
      summary: '本政策说明 Pacific Drone 如何收集、使用、共享、保护和保留个人信息。',
      lastUpdated: '2026 年 6 月 13 日',
      sections: [
        {
          heading: '重要说明',
          body: [
            '本政策面向北美培训网站撰写，在最终发布前，建议由具备资质的隐私或法律顾问审核。',
            '本政策以实用方式说明 Pacific Drone 的隐私实践，不限制适用法律下不得被限制的权利。',
          ],
        },
        {
          heading: '负责主体',
          body: [
            'Pacific Drone 对其控制范围内的个人信息负责。',
            '隐私问题或请求可发送至 info@pacificdrone.ca。',
          ],
        },
        {
          heading: '收集的信息',
          body: ['Pacific Drone 可能收集提供培训、运营账号、处理购买和改进服务所需的信息。'],
          bullets: [
            '联系方式，例如姓名、电子邮箱、电话号码和账单信息。',
            '账号信息，例如用户名、密码状态、课程报名、学习进度、测验结果、完成记录和支持历史。',
            '购买信息，例如订购产品、交易记录、退款状态、税务信息和付款确认详情。',
            '技术信息，例如 IP 地址、浏览器、设备、操作系统、浏览页面、来源页面、大致位置、Cookie 标识符和使用日志。',
            '你发送给 Pacific Drone 的通信内容，包括支持请求、预约信息、反馈和法律通知。',
          ],
        },
        {
          heading: '使用目的',
          body: ['Pacific Drone 将个人信息用于业务和培训目的。'],
          bullets: [
            '创建、保护和管理账号。',
            '交付课程、跟踪进度、提供支持，并管理证书或完成记录。',
            '处理付款、税费、退款、拒付和会计记录。',
            '发送服务消息、政策更新、购买确认、预约详情和支持回复。',
            '改进课程内容、平台性能、安全性、分析、营销和客户体验。',
            '履行法律、监管、税务、反欺诈、争议解决和执行义务。',
          ],
        },
        {
          heading: '第三方服务商',
          body: [
            'Pacific Drone 可能与帮助运营业务的服务商共享个人信息，包括托管、支付、分析、邮件、预约、客户支持、视频传输、安全、会计和广告服务商。',
            '服务商应仅为向 Pacific Drone 提供服务而使用信息，并受其自身法律义务和政策约束。',
          ],
        },
        {
          heading: '支付处理商与银行卡号',
          body: [
            '付款由 Stripe 等第三方支付处理商处理。',
            'Pacific Drone 不在自身系统中保存完整的银行卡号。支付处理商可能根据其自身条款和隐私政策收集、处理和保存付款详情。',
          ],
        },
        {
          heading: 'Cookie、分析、广告与同意',
          body: [
            'Pacific Drone 可能使用 Cookie、分析工具、广告像素和类似技术来运营网站、记住偏好、衡量表现、了解使用情况并支持营销。',
            '在法律要求的情况下，Pacific Drone 会在使用非必要 Cookie 或类似技术前请求同意。',
            '你可以撤回同意、调整浏览器设置、使用可用的 Cookie 控制工具，或通过支持的分析或广告控制方式选择退出。禁用 Cookie 后，部分功能可能无法正常使用。',
          ],
        },
        {
          heading: '跨境处理',
          body: [
            '个人信息可能在加拿大、美国或 Pacific Drone 及其服务商运营所在的其他司法辖区被处理或存储。',
            '在你所在省、州或国家以外处理的信息，可能受该司法辖区法律约束。',
          ],
        },
        {
          heading: '保留期限',
          body: [
            'Pacific Drone 仅在本政策所述目的合理需要的期间保留个人信息，包括培训记录、支持、会计、税务、法律、安全和争议需要。',
            '保留期限可能因记录类型、法律义务和业务需要而不同。',
          ],
        },
        {
          heading: '用户权利',
          body: [
            '根据你所在地区的法律，你可能有权访问、更正、删除、限制、反对处理或取得某些个人信息的副本。',
            '你可以联系 info@pacificdrone.ca 提出隐私请求。Pacific Drone 可能需要先验证你的身份再作出回应。',
          ],
        },
        {
          heading: '营销退订',
          body: [
            '你可以通过邮件中的退订链接或联系 Pacific Drone 退订营销邮件。',
            'Pacific Drone 仍可能发送与你的账号、购买、培训、支持或法律通知有关的交易性或服务性消息。',
          ],
        },
        {
          heading: '安全措施',
          body: [
            'Pacific Drone 采取合理的管理、技术和组织措施，旨在保护个人信息。',
            '任何网站、平台、电子邮件或存储系统都无法保证绝对安全。',
          ],
        },
        {
          heading: '数据泄露响应',
          body: [
            '如果 Pacific Drone 发现涉及个人信息的隐私或安全事件，将评估该事件，并采取符合情况的合理措施。',
            '在法律要求的情况下，Pacific Drone 将通知受影响个人、监管机构或其他必要方。',
          ],
        },
        {
          heading: '未成年人',
          body: [
            'Pacific Drone 服务不面向儿童在没有适当父母或监护人参与的情况下使用。',
            '如果你认为未成年人在没有适当许可的情况下提供了个人信息，请联系 info@pacificdrone.ca。',
          ],
        },
      ],
    },
  },
  'refund-policy': {
    en: {
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
    zh: {
      slug: 'refund-policy',
      title: '退款政策',
      eyebrow: '购买与退款',
      summary: '本政策说明 Pacific Drone 课程、飞行评估及相关购买的退款资格。',
      lastUpdated: '2026 年 6 月 13 日',
      sections: [
        {
          heading: '重要说明',
          body: [
            '本退款政策在作为最终业务政策发布前，建议由具备资质的法律顾问审核。',
            'Pacific Drone 可能针对未来购买更新本政策；除非法律另有要求，购买时显示的政策通常适用于该次购买。',
          ],
        },
        {
          heading: '如何申请退款',
          body: [
            '如需申请退款，请发送邮件至 info@pacificdrone.ca，并提供姓名、账号邮箱、订单详情和申请原因。',
            'Pacific Drone 可能要求提供确认购买和评估退款资格所需的额外信息。',
          ],
        },
        {
          heading: '标准 14 天课程退款规则',
          body: [
            '对于符合条件的课程购买，你可以在购买日起 14 天内申请退款。',
            '如果已访问或浏览超过 20% 的课程内容，该购买不符合退款条件。',
          ],
        },
        {
          heading: '课程进度限制',
          body: [
            'Pacific Drone 可能使用平台记录、视频活动、课程状态、测验活动、下载活动或其他账号数据，判断是否已访问或浏览超过 20% 的课程内容。',
            '如果超过 20% 的限制，除非法律要求或 Pacific Drone 作为特殊情况批准，否则该课程购买不可退款。',
          ],
        },
        {
          heading: '飞行评估退款',
          body: [
            '已预约的飞行评估在预约时间前 48 小时内不可退款。',
            '如在预约时间 48 小时以前取消，飞行评估可退款，但将扣除飞行评估费用的 50%。',
            '未到场、迟到、未满足资格要求，或未携带所需材料，可能被视为不可退款，除非 Pacific Drone 批准其他处理方式。',
          ],
        },
        {
          heading: '不可退款情形',
          body: ['除非法律要求或 Pacific Drone 书面批准，以下情形不提供退款。'],
          bullets: [
            '符合条件的课程购买已超过购买日起 14 天后才提出退款请求。',
            '已访问或浏览超过 20% 的课程内容。',
            '产品、服务、套餐、促销或活动在购买时已明确标示为不可退款。',
            '账号因滥用、账号共享、违法行为、拒付滥用或违反条款而被暂停或终止。',
            '退款请求基于未通过考试、未取得证书、未获得工作、未获得收入或未达到运营合规。',
            '退款请求涉及无法追回的第三方费用、银行费用、汇率差异或税费。',
          ],
        },
        {
          heading: '处理与退款方式',
          body: [
            '获批的退款通常会通过适用的第三方支付处理商退回原付款方式。',
            '处理时间取决于支付处理商、银行卡网络、银行和付款方式。Pacific Drone 无法保证资金到达你账户的具体日期。',
          ],
        },
        {
          heading: '拒付',
          body: [
            '在发起拒付前，请先通过 info@pacificdrone.ca 联系 Pacific Drone，以便直接审查问题。',
            '对于 Pacific Drone 认为无效、欺诈、与本政策不一致，或涉及已按购买内容交付服务的拒付，Pacific Drone 可能提出争议。',
          ],
        },
        {
          heading: '特殊情况',
          body: [
            'Pacific Drone 可能酌情考虑重复购买、付款错误、严重疾病、紧急情况或其他异常事实。',
            '除非法律要求，特殊情况退款由 Pacific Drone 酌情决定，并可能需要支持材料。',
          ],
        },
      ],
    },
  },
  contact: {
    en: {
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
    zh: {
      slug: 'contact',
      title: '联系与法律通知',
      eyebrow: '联系与通知',
      summary: '你可以通过本页联系 Pacific Drone，处理支持、隐私请求、退款请求和法律通知。',
      lastUpdated: '2026 年 6 月 13 日',
      sections: [
        {
          heading: '联系邮箱',
          body: [
            '你可以通过 info@pacificdrone.ca 联系 Pacific Drone。',
            '请提供你的姓名、账号邮箱、相关订单详情，以及对请求的清晰说明。',
          ],
        },
        {
          heading: '法律通知',
          body: [
            '法律通知应发送至 info@pacificdrone.ca，并包含足够信息，以便 Pacific Drone 识别涉及的问题、账号、交易或内容。',
            '通过电子邮件发送通知，并不保证电子邮件通知对每一种索赔、期限或法律程序都具有充分的法律效力。',
          ],
        },
        {
          heading: '支持范围',
          body: [
            'Pacific Drone 可以协助处理账号访问、课程访问、付款问题、退款请求、预约问题和一般培训支持。',
            '支持回复可能取决于账号状态、产品条款、可用记录和请求性质。',
          ],
        },
        {
          heading: '不提供法律、紧急或运营授权建议',
          body: [
            'Pacific Drone 不提供法律建议、紧急响应服务、空中交通授权、运营批准或特定场地的飞行许可。',
            '如遇紧急情况，请联系相应紧急服务。对于法律、监管或运营授权问题，请咨询相应监管机构、主管机关或合格专业人士。',
          ],
        },
        {
          heading: '监管免责声明',
          body: [
            '无人机规则、程序和监管指导可能发生变化。',
            'Pacific Drone 培训仅用于教育目的，不能替代你核实当前要求、遵守适用法律并安全运营的责任。',
          ],
        },
        {
          heading: '相关政策链接',
          body: [
            '相关页面包括使用条款、隐私政策和退款政策。',
            '这些页面说明使用 Pacific Drone 服务时的重要条件，包括账号规则、数据实践、退款资格和课程访问。',
          ],
        },
      ],
    },
  },
};

export function getLegalPage(slug: LegalPageSlug, locale: string): LegalPageContent {
  return legalPages[slug][locale === 'zh' ? 'zh' : 'en'];
}
