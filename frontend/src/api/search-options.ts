export const GOVERNORATES = [
  'Alexandria',
  'Aswan',
  'Cairo',
  'Giza',
  'Hurghada',
  'Luxor',
  'Mansoura',
  'Red Sea',
  'Sharm El-Sheikh',
];

export const GOVERNORATE_LABELS: Record<string, string> = {
  Alexandria: 'الإسكندرية',
  Aswan: 'أسوان',
  Cairo: 'القاهرة',
  Giza: 'الجيزة',
  Hurghada: 'الغردقة',
  Luxor: 'الأقصر',
  Mansoura: 'المنصورة',
  'Red Sea': 'البحر الأحمر',
  'Sharm El-Sheikh': 'شرم الشيخ',
};

export const CATEGORIES = [
  'clinic',
  'dental-clinic',
  'medical-center',
  'pharmacy',
  'restaurant',
  'car-service',
  'home-services',
  'beauty-salon',
  'gym',
  'academy',
];

export const CATEGORY_LABELS: Record<string, string> = {
  clinic: 'عيادات',
  'dental-clinic': 'طب أسنان',
  'medical-center': 'مراكز طبية',
  pharmacy: 'صيدليات',
  restaurant: 'مطاعم',
  'car-service': 'خدمات سيارات',
  'home-services': 'خدمات منزلية',
  'beauty-salon': 'تجميل',
  gym: 'جيم',
  academy: 'أكاديميات',
};

export const MIN_RATINGS = [
  { value: '', label: 'أي تقييم' },
  { value: '3', label: 'من 3 فما فوق' },
  { value: '3.5', label: 'من 3.5 فما فوق' },
  { value: '4', label: 'من 4 فما فوق' },
  { value: '4.5', label: 'من 4.5 فما فوق' },
];

export const PROVIDER_LABELS: Record<string, string> = {
  mock: 'مصدر تجريبي',
  'google-places': 'خرائط جوجل',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: 'موثّق',
  UNVERIFIED: 'غير موثّق',
  UNKNOWN: 'غير معروف',
};

export const LEAD_STATUSES = ['NEW', 'REVIEWED', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED'] as const;

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'جديد',
  REVIEWED: 'تمت المراجعة',
  CONTACTED: 'تم التواصل',
  QUALIFIED: 'مؤهل',
  DISQUALIFIED: 'غير مؤهل',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  SCHEDULED: 'مجدول',
  RUNNING: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  FAILED: 'فشل',
  PAUSED: 'متوقف مؤقتًا',
  CANCELLED: 'ملغي',
};

export const ENRICHMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'في الانتظار',
  IN_PROGRESS: 'جارٍ الإثراء',
  ENRICHED: 'تم الإثراء',
  PARTIALLY_ENRICHED: 'إثراء جزئي',
  ENRICHMENT_FAILED: 'فشل الإثراء',
  SKIPPED: 'متخطّى',
};

export const QUALIFICATION_LABELS: Record<string, string> = {
  QUALIFIED: 'مؤهل',
  'UNVERIFIED_SOCIAL': 'تواصل غير موثّق',
  REJECTED: 'مرفوض',
};
