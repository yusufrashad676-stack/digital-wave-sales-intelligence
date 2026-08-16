import type {
  CriteriaValue,
  SearchIntent,
  SearchIntentCriteria,
  SearchIntentDiscovery,
  SearchIntentOpportunity,
} from '../../domain/entities/search-intent.js';

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const CATEGORY_PATTERNS: ReadonlyArray<{ patterns: string[]; category: string }> = [
  {
    patterns: [
      'عيادة اسنان',
      'عيادة أسنان',
      'عيادات اسنان',
      'عيادات أسنان',
      'طب اسنان',
      'طب أسنان',
      'dental clinic',
      'dental clinics',
      'dentist',
      'dentists',
    ],
    category: 'dental-clinic',
  },
  {
    patterns: ['عيادة', 'عيادات', 'clinic', 'clinics'],
    category: 'clinic',
  },
  {
    patterns: ['مطعم', 'مطاعم', 'restaurant', 'restaurants'],
    category: 'restaurant',
  },
  {
    patterns: ['صيدلية', 'صيدليات', 'pharmacy', 'pharmacies'],
    category: 'pharmacy',
  },
  {
    patterns: ['مستشفى', 'مستشفيات', 'مركز طبي', 'مراكز طبية', 'medical center', 'hospital'],
    category: 'medical-center',
  },
  {
    patterns: ['صالون', 'صالونات', 'salon', 'salons', 'تجميل', 'beauty', 'beauty salon'],
    category: 'beauty-salon',
  },
  {
    patterns: ['جيم', 'نادي', 'gym', 'fitness'],
    category: 'gym',
  },
  {
    patterns: ['أكاديمية', 'أكاديميات', 'academy', 'academies', 'مدرسة', 'مدارس', 'school', 'schools'],
    category: 'academy',
  },
  {
    patterns: ['ورشة', 'ورش', 'car service', 'car repair', 'سيارة'],
    category: 'car-service',
  },
];

const LOCATION_PATTERNS: ReadonlyArray<{ patterns: string[]; area?: string; governorate: string }> = [
  {
    patterns: ['التجمع الخامس', 'التجمع', 'new cairo'],
    area: 'New Cairo',
    governorate: 'Cairo',
  },
  {
    patterns: ['القاهرة الجديدة', 'cairo new'],
    area: 'New Cairo',
    governorate: 'Cairo',
  },
  {
    patterns: ['مدينة نصر', 'madinat nasr'],
    area: 'Nasr City',
    governorate: 'Cairo',
  },
  {
    patterns: ['المعادي', 'maadi'],
    area: 'Maadi',
    governorate: 'Cairo',
  },
  {
    patterns: ['مصر الجديدة', 'heliopolis', 'الزاوية الحمراء'],
    area: 'Heliopolis',
    governorate: 'Cairo',
  },
  {
    patterns: ['الزمالك', 'zamalek'],
    area: 'Zamalek',
    governorate: 'Cairo',
  },
  {
    patterns: ['وسط البلد', 'downtown'],
    area: 'Downtown',
    governorate: 'Cairo',
  },
  {
    patterns: ['القاهرة', 'cairo'],
    governorate: 'Cairo',
  },
  {
    patterns: ['الإسكندرية', 'اسكندرية', 'alexandria', 'alex'],
    governorate: 'Alexandria',
  },
  {
    patterns: ['الجيزة', 'giza'],
    governorate: 'Giza',
  },
];

const WEBSITE_ABSENT_PATTERNS: ReadonlyArray<string> = [
  'من غير website',
  'بدون website',
  'لا يوجد موقع',
  'مفيش website',
  'معندهاش website',
  'من غير موقع',
  'بدون موقع',
  'no website',
  'without website',
  'without a website',
  'no site',
  'without site',
];

const WEBSITE_PRESENT_PATTERNS: ReadonlyArray<string> = [
  'عندها website',
  'لديها website',
  'معاها website',
  'عندها موقع',
  'لديها موقع',
  'معاها موقع',
  'has website',
  'with website',
  'with a website',
  'has a site',
  'with site',
];

const SOCIAL_ABSENT_PATTERNS: ReadonlyArray<string> = [
  'معندهاش social',
  'مفيش social',
  'بدون social',
  'من غير social',
  'لا يوجد سوشيال',
  'no social media',
  'without social media',
  'no social',
  'without social',
];

const SOCIAL_PRESENT_PATTERNS: ReadonlyArray<string> = [
  'عندها social media',
  'عندها سوشيال ميديا',
  'عندها سوشيال',
  'لديها social media',
  'لديها سوشيال ميديا',
  'معاها social media',
  'has social media',
  'with social media',
  'has social',
  'with social',
];

const RATING_PATTERNS: ReadonlyArray<RegExp> = [
  /تقييم\s*(\d+(?:\.\d+)?)/,
  /(\d+(?:\.\d+)?)\s*نجوم/,
  /(\d+(?:\.\d+)?)\s*stars?/i,
  /rating\s*(\d+(?:\.\d+)?)/i,
  /minimum\s*rating\s*(\d+(?:\.\d+)?)/i,
  /على\s*الأقل\s*(\d+(?:\.\d+)?)/,
  /تقييمها\s*(\d+(?:\.\d+)?)/,
];

const QUANTITY_PATTERNS: ReadonlyArray<RegExp> = [
  /(\d+)\s*(?:عيادة|عيادات|dentist|clinic|result|lead)/i,
  /(?:هاتلي|عايز|أريد|اريد|ابحث\s*عن| give me| i want| i need)\s*(\d+)/i,
  /(\d+)\s*(?:في|من)/,
];

const MAX_QUANTITY = 500;
const DEFAULT_MAX_QUANTITY = 20;

function normalizeArabic(text: string): string {
  let normalized = text;
  normalized = normalized.replace(
    /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g,
    '',
  );
  normalized = normalized.replace(/[؟!،؛:]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim();
}

function toWesternDigits(text: string): string {
  let result = text;
  for (const [arabic, western] of Object.entries(ARABIC_INDIC_DIGITS)) {
    result = result.replaceAll(arabic, western);
  }
  return result;
}

function extractQuantity(normalized: string): number | undefined {
  for (const pattern of QUANTITY_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match?.[1] !== undefined) {
      const num = Number.parseInt(match[1], 10);
      if (num > 0 && num <= MAX_QUANTITY) {
        return num;
      }
    }
  }
  return undefined;
}

function extractCategory(normalized: string): string | undefined {
  const lower = normalized.toLowerCase();
  for (const entry of CATEGORY_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (lower.includes(pattern)) {
        return entry.category;
      }
    }
  }
  return undefined;
}

function extractLocation(normalized: string): { area?: string; governorate?: string } {
  const lower = normalized.toLowerCase();
  for (const entry of LOCATION_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (lower.includes(pattern)) {
        return { area: entry.area, governorate: entry.governorate };
      }
    }
  }
  return {};
}

function matchAnyPattern(normalized: string, patterns: ReadonlyArray<string>): boolean {
  const lower = normalized.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function extractWebsiteCriteria(normalized: string): CriteriaValue {
  if (matchAnyPattern(normalized, WEBSITE_ABSENT_PATTERNS)) return 'ABSENT';
  if (matchAnyPattern(normalized, WEBSITE_PRESENT_PATTERNS)) return 'PRESENT';
  return 'ANY';
}

function extractSocialCriteria(normalized: string): CriteriaValue {
  if (matchAnyPattern(normalized, SOCIAL_ABSENT_PATTERNS)) return 'ABSENT';
  if (matchAnyPattern(normalized, SOCIAL_PRESENT_PATTERNS)) return 'PRESENT';
  return 'ANY';
}

function extractRating(normalized: string): number | undefined {
  for (const pattern of RATING_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match?.[1] !== undefined) {
      const num = Number.parseFloat(match[1]);
      if (num >= 0 && num <= 5) {
        return Math.round(num * 10) / 10;
      }
    }
  }
  return undefined;
}

export function translateArabicIntent(rawQuery: string): SearchIntent {
  const normalized = normalizeArabic(toWesternDigits(rawQuery));

  const quantity = extractQuantity(normalized);
  const category = extractCategory(normalized) ?? 'clinic';
  const location = extractLocation(normalized);
  const minRating = extractRating(normalized);
  const website = extractWebsiteCriteria(normalized);
  const social = extractSocialCriteria(normalized);

  const discovery: SearchIntentDiscovery = {
    category,
    location,
    ...(minRating !== undefined ? { minRating } : {}),
  };

  const criteria: SearchIntentCriteria = {
    website,
    social,
    ...(minRating !== undefined ? { minRating } : {}),
  };

  const opportunity: SearchIntentOpportunity = {
    maxQuantity: quantity ?? DEFAULT_MAX_QUANTITY,
  };

  return {
    rawQuery,
    discovery,
    criteria,
    opportunity,
  };
}
