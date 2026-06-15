export type MarketingPageSlug = 'about' | 'faq';

export interface MarketingSection {
  id?: string;
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface MarketingPageContent {
  title: string;
  eyebrow: string;
  summary: string;
  metaTitle: string;
  metaDescription: string;
  sections: MarketingSection[];
}

const lastLine = {
  en: 'Pacific Drone is independent and is not affiliated with or endorsed by Transport Canada.',
  zh: 'Pacific Drone 为独立培训平台，与加拿大交通部无隶属或背书关系。',
};

const pages: Record<MarketingPageSlug, Record<'en' | 'zh', MarketingPageContent>> = {
  about: {
    en: {
      eyebrow: 'About Pacific Drone',
      title: 'Canadian RPAS training built for practical pilots',
      summary:
        'Pacific Drone helps Canadian drone pilots prepare for Basic and Advanced RPAS certification with focused lessons, realistic practice, and flight review support in British Columbia.',
      metaTitle: 'About Pacific Drone | Canadian RPAS Training in BC',
      metaDescription:
        'Learn about Pacific Drone, a British Columbia RPAS training platform for Basic and Advanced drone certification preparation and flight review support.',
      sections: [
        {
          heading: 'Who we serve',
          body: [
            'Pacific Drone supports new and returning RPAS pilots who want a clear path through Canadian drone rules, exam preparation, and recurrent skills review.',
            'The site is designed for pilots preparing for Basic Operations, Advanced Operations, and flight review readiness under the Canadian RPAS framework.',
          ],
        },
        {
          heading: 'What we focus on',
          body: [
            'Our training content is organized around the knowledge areas pilots need to understand before operating remotely piloted aircraft in Canada.',
          ],
          bullets: [
            'Air law, operating rules, and airspace awareness.',
            'Human factors, flight planning, weather, and decision-making.',
            'Exam-style practice for Basic and Advanced certification preparation.',
            'Flight review preparation for pilots who need to demonstrate current operational skills.',
          ],
        },
        {
          heading: 'How Pacific Drone is different',
          body: [
            'Pacific Drone keeps the learning path focused: understand the rule, practice the scenario, review the explanation, and return to weak areas before booking or taking the next step.',
            'We are building the platform around practical Canadian RPAS use, with plain-language explanations and bilingual access for English and Chinese learners.',
          ],
        },
        {
          heading: 'Important note',
          body: [
            'Course materials are educational and do not replace the current Canadian Aviation Regulations, Transport Canada guidance, or operational judgment.',
            lastLine.en,
          ],
        },
      ],
    },
    zh: {
      eyebrow: '关于 Pacific Drone',
      title: '面向实操飞手的加拿大 RPAS 培训',
      summary:
        'Pacific Drone 帮助加拿大无人机飞手准备 Basic 与 Advanced RPAS 认证，并为不列颠哥伦比亚省的飞行复查提供学习支持。',
      metaTitle: '关于 Pacific Drone | 加拿大 RPAS 培训',
      metaDescription:
        '了解 Pacific Drone：面向加拿大 Basic 与 Advanced 无人机执照备考、题库练习和飞行复查准备的双语 RPAS 培训平台。',
      sections: [
        {
          heading: '我们服务谁',
          body: [
            'Pacific Drone 面向准备学习加拿大无人机法规、参加 RPAS 考试或更新飞行技能的飞手。',
            '平台覆盖 Basic Operations、Advanced Operations，以及需要准备 Flight Review 的飞手。',
          ],
        },
        {
          heading: '我们重点讲什么',
          body: [
            '课程围绕加拿大 RPAS 飞手在实际运行前需要理解的核心知识领域组织。',
          ],
          bullets: [
            '航空法规、运行规则与空域意识。',
            '人为因素、飞行计划、天气判断与风险决策。',
            '面向 Basic 与 Advanced 认证的模拟考试练习。',
            '面向飞行复查的实操准备与流程理解。',
          ],
        },
        {
          heading: 'Pacific Drone 的方式',
          body: [
            '我们把学习路径做得更直接：理解规则、练习场景、查看解析，再回到薄弱知识点继续复盘。',
            '平台以加拿大 RPAS 实际使用为核心，使用清晰语言讲解，并提供英文与中文学习入口。',
          ],
        },
        {
          heading: '重要说明',
          body: [
            '课程材料用于教育与备考，不替代最新《加拿大航空条例》、加拿大交通部官方指引或飞行员自己的运行判断。',
            lastLine.zh,
          ],
        },
      ],
    },
  },
  faq: {
    en: {
      eyebrow: 'FAQ',
      title: 'Basic Drone License Canada, Advanced Drone License Canada, and Flight Review FAQ',
      summary:
        'Answers to common questions about Canadian RPAS certification paths, practice exams, and flight review preparation.',
      metaTitle: 'Drone License Canada FAQ | Basic, Advanced, and Flight Review',
      metaDescription:
        'FAQ for Basic Drone License Canada, Advanced Drone License Canada, RPAS exam prep, and flight review preparation with Pacific Drone.',
      sections: [
        {
          id: 'basic-drone-license-canada',
          heading: 'Basic Drone License Canada',
          body: [
            'A Basic RPAS pilot certificate is commonly used by pilots who fly in lower-risk conditions, such as uncontrolled airspace and away from bystanders.',
            'Pacific Drone helps Basic candidates review the knowledge areas tested in Canada, practice exam-style questions, and understand why each answer is right or wrong.',
          ],
          bullets: [
            'Best for new pilots building a legal foundation.',
            'Covers air law, flight operations, weather, human factors, navigation, and aircraft systems.',
            'Practice is educational and does not guarantee passing the official Transport Canada exam.',
          ],
        },
        {
          id: 'advanced-drone-license-canada',
          heading: 'Advanced Drone License Canada',
          body: [
            'An Advanced RPAS pilot certificate is for pilots who need broader operating privileges, including controlled airspace operations when properly authorized.',
            'Pacific Drone Advanced preparation focuses on the higher-risk topics pilots need to understand before moving beyond Basic operations.',
          ],
          bullets: [
            'Useful for commercial, inspection, media, survey, and operational pilots.',
            'Includes controlled airspace, communications, site surveys, operations near people, and risk management.',
            'Advanced privileges still depend on current regulations, airspace authorization, aircraft eligibility, and safe operating decisions.',
          ],
        },
        {
          id: 'flight-review',
          heading: 'Flight Review',
          body: [
            'A flight review is a practical evaluation for Advanced RPAS pilots. It helps confirm that a pilot can apply procedures, safety checks, and decision-making in a practical setting.',
            'Pacific Drone can help pilots prepare by reviewing expectations, emergency procedures, operational planning, and common weak areas before the scheduled review.',
          ],
          bullets: [
            'Review current documents, site planning, emergency procedures, and aircraft readiness.',
            'Bring required identification, pilot certificate information, and aircraft documentation when applicable.',
            'Booking, refund, and cancellation terms are described in the Refund Policy.',
          ],
        },
        {
          heading: 'Is Pacific Drone affiliated with Transport Canada?',
          body: [
            lastLine.en,
            'Always confirm operational requirements against the current Canadian Aviation Regulations and official Transport Canada resources before flying.',
          ],
        },
      ],
    },
    zh: {
      eyebrow: '常见问题',
      title: '加拿大 Basic 无人机执照、Advanced 无人机执照与 Flight Review 常见问题',
      summary:
        '了解加拿大 RPAS 认证路径、模拟考试练习，以及飞行复查准备的常见问题。',
      metaTitle: '加拿大无人机执照 FAQ | Basic、Advanced 与 Flight Review',
      metaDescription:
        'Pacific Drone 常见问题：加拿大 Basic 无人机执照、Advanced 无人机执照、RPAS 模拟考试与飞行复查准备。',
      sections: [
        {
          id: 'basic-drone-license-canada',
          heading: '加拿大 Basic 无人机执照',
          body: [
            'Basic RPAS pilot certificate 通常适合在较低风险环境下飞行的飞手，例如非管制空域、远离旁观者的飞行任务。',
            'Pacific Drone 帮助 Basic 学员复习加拿大考试涉及的知识领域，练习类似考试的题目，并理解每个答案背后的原因。',
          ],
          bullets: [
            '适合正在建立合法飞行基础的新手飞手。',
            '覆盖航空法规、飞行操作、天气、人为因素、导航与机体系统。',
            '练习内容用于学习，不保证通过加拿大交通部正式考试。',
          ],
        },
        {
          id: 'advanced-drone-license-canada',
          heading: '加拿大 Advanced 无人机执照',
          body: [
            'Advanced RPAS pilot certificate 面向需要更广运行权限的飞手，例如在获得授权后进入管制空域运行。',
            'Pacific Drone 的 Advanced 准备内容重点覆盖从 Basic 进入更复杂运行环境前需要理解的高风险主题。',
          ],
          bullets: [
            '适合商业拍摄、巡检、测绘、媒体制作和其他运行型飞手。',
            '覆盖管制空域、航空通信、场地评估、在人群附近运行和风险管理。',
            'Advanced 权限仍取决于最新法规、空域授权、机型合规性和安全运行判断。',
          ],
        },
        {
          id: 'flight-review',
          heading: 'Flight Review 飞行复查',
          body: [
            'Flight Review 是面向 Advanced RPAS 飞手的实操评估，用来确认飞手可以在实际环境中应用程序、检查和安全决策。',
            'Pacific Drone 可帮助飞手在预约复查前复习评估预期、紧急程序、运行计划和常见薄弱点。',
          ],
          bullets: [
            '复习当前文件、场地规划、紧急程序和飞机准备状态。',
            '按要求准备身份证明、飞手证书信息和适用的飞机文件。',
            '预约、退款和取消规则见退款政策。',
          ],
        },
        {
          heading: 'Pacific Drone 与加拿大交通部有关联吗？',
          body: [
            lastLine.zh,
            '每次飞行前，请以最新《加拿大航空条例》和加拿大交通部官方资源确认运行要求。',
          ],
        },
      ],
    },
  },
};

export function getMarketingPage(slug: MarketingPageSlug, locale: string): MarketingPageContent {
  return pages[slug][locale === 'zh' ? 'zh' : 'en'];
}
