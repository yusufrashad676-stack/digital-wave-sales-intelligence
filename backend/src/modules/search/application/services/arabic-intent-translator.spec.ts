import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translateArabicIntent } from './arabic-intent-translator.js';

describe('translateArabicIntent', () => {
  it('parses the full acceptance test query', () => {
    const intent = translateArabicIntent('هاتلي 100 عيادة أسنان في التجمع معندهاش Website وعندها Social Media');
    assert.equal(intent.rawQuery, 'هاتلي 100 عيادة أسنان في التجمع معندهاش Website وعندها Social Media');
    assert.equal(intent.discovery.category, 'dental-clinic');
    assert.equal(intent.discovery.location.area, 'New Cairo');
    assert.equal(intent.discovery.location.governorate, 'Cairo');
    assert.equal(intent.criteria.website, 'ABSENT');
    assert.equal(intent.criteria.social, 'PRESENT');
    assert.equal(intent.opportunity.maxQuantity, 100);
  });

  it('parses dental clinic with website presence', () => {
    const intent = translateArabicIntent('عايز 50 عيادة أسنان في القاهرة الجديدة عندها website');
    assert.equal(intent.discovery.category, 'dental-clinic');
    assert.equal(intent.discovery.location.area, 'New Cairo');
    assert.equal(intent.discovery.location.governorate, 'Cairo');
    assert.equal(intent.criteria.website, 'PRESENT');
    assert.equal(intent.criteria.social, 'ANY');
    assert.equal(intent.opportunity.maxQuantity, 50);
  });

  it('parses English dental query', () => {
    const intent = translateArabicIntent('هاتلي 20 dentist في Cairo');
    assert.equal(intent.discovery.category, 'dental-clinic');
    assert.equal(intent.discovery.location.governorate, 'Cairo');
    assert.equal(intent.criteria.website, 'ANY');
    assert.equal(intent.criteria.social, 'ANY');
    assert.equal(intent.opportunity.maxQuantity, 20);
  });

  it('does not invent quantity when none is present', () => {
    const intent = translateArabicIntent('عيادات أسنان في التجمع');
    assert.equal(intent.discovery.category, 'dental-clinic');
    assert.equal(intent.discovery.location.area, 'New Cairo');
    assert.equal(intent.opportunity.maxQuantity, 20);
  });

  it('extracts Arabic-Indic quantity', () => {
    const intent = translateArabicIntent('هاتلي ١٠٠ عيادة أسنان في التجمع');
    assert.equal(intent.opportunity.maxQuantity, 100);
  });

  it('extracts rating from Arabic patterns', () => {
    const intent = translateArabicIntent('هاتلي 30 عيادة أسنان في التجمع تقييم 4 نجوم');
    assert.equal(intent.opportunity.maxQuantity, 30);
    assert.equal(intent.discovery.minRating, 4);
    assert.equal(intent.criteria.minRating, 4);
  });

  it('extracts rating from English patterns', () => {
    const intent = translateArabicIntent('10 clinics in Cairo rating 4.5');
    assert.equal(intent.discovery.minRating, 4.5);
    assert.equal(intent.criteria.minRating, 4.5);
  });

  it('handles website absence variants', () => {
    const variants = [
      'من غير website',
      'بدون website',
      'لا يوجد موقع',
      'مفيش website',
      'من غير موقع',
      'بدون موقع',
      'no website',
      'without website',
      'without a website',
    ];
    for (const variant of variants) {
      const intent = translateArabicIntent(`${variant} عيادات`);
      assert.equal(intent.criteria.website, 'ABSENT', `Failed for: ${variant}`);
    }
  });

  it('handles website presence variants', () => {
    const variants = [
      'عندها website',
      'لديها website',
      'معاها website',
      'عندها موقع',
      'لديها موقع',
      'has website',
      'with website',
    ];
    for (const variant of variants) {
      const intent = translateArabicIntent(`${variant} عيادات`);
      assert.equal(intent.criteria.website, 'PRESENT', `Failed for: ${variant}`);
    }
  });

  it('handles social media presence variants', () => {
    const variants = [
      'عندها social media',
      'عندها سوشيال ميديا',
      'عندها سوشيال',
      'has social media',
      'with social media',
    ];
    for (const variant of variants) {
      const intent = translateArabicIntent(`${variant} عيادات`);
      assert.equal(intent.criteria.social, 'PRESENT', `Failed for: ${variant}`);
    }
  });

  it('handles social media absence variants', () => {
    const variants = ['معندهاش social', 'مفيش social', 'بدون social', 'no social media', 'without social media'];
    for (const variant of variants) {
      const intent = translateArabicIntent(`${variant} عيادات`);
      assert.equal(intent.criteria.social, 'ABSENT', `Failed for: ${variant}`);
    }
  });

  it('maps various categories correctly', () => {
    assert.equal(translateArabicIntent('مطعم في القاهرة').discovery.category, 'restaurant');
    assert.equal(translateArabicIntent('صيدلية في التجمع').discovery.category, 'pharmacy');
    assert.equal(translateArabicIntent('مستشفى في القاهرة').discovery.category, 'medical-center');
    assert.equal(translateArabicIntent('جيم في القاهرة').discovery.category, 'gym');
    assert.equal(translateArabicIntent('صالون تجميل').discovery.category, 'beauty-salon');
    assert.equal(translateArabicIntent('أكاديمية في القاهرة').discovery.category, 'academy');
    assert.equal(translateArabicIntent('عيادة في القاهرة').discovery.category, 'clinic');
  });

  it('maps locations correctly', () => {
    assert.equal(translateArabicIntent('عيادات في التجمع الخامس').discovery.location.area, 'New Cairo');
    assert.equal(translateArabicIntent('عيادات في القاهرة الجديدة').discovery.location.area, 'New Cairo');
    assert.equal(translateArabicIntent('عيادات في مدينة نصر').discovery.location.area, 'Nasr City');
    assert.equal(translateArabicIntent('عيادات في المعادي').discovery.location.area, 'Maadi');
    assert.equal(translateArabicIntent('عيادات في الإسكندرية').discovery.location.governorate, 'Alexandria');
    assert.equal(translateArabicIntent('عيادات في الجيزة').discovery.location.governorate, 'Giza');
  });

  it('defaults to clinic category for unknown category', () => {
    const intent = translateArabicIntent('هاتلي 50 في القاهرة');
    assert.equal(intent.discovery.category, 'clinic');
  });

  it('returns default maxQuantity of 20 when no quantity present', () => {
    const intent = translateArabicIntent('عيادات أسنان');
    assert.equal(intent.opportunity.maxQuantity, 20);
  });

  it('rejects impossible quantities (0)', () => {
    const intent = translateArabicIntent('هاتلي 0 عيادة');
    assert.equal(intent.opportunity.maxQuantity, 20);
  });

  it('rejects quantities exceeding maximum', () => {
    const intent = translateArabicIntent('هاتلي 600 عيادة');
    assert.equal(intent.opportunity.maxQuantity, 20);
  });

  it('is deterministic for identical input', () => {
    const query = 'هاتلي 100 عيادة أسنان في التجمع';
    const first = translateArabicIntent(query);
    const second = translateArabicIntent(query);
    assert.deepEqual(first, second);
  });

  it('does not mutate the original rawQuery', () => {
    const original = 'هاتلي 100 عيادة أسنان في التجمع';
    const copy = structuredClone(original);
    translateArabicIntent(original);
    assert.equal(original, copy);
  });

  it('defaults criteria to ANY when no explicit criterion', () => {
    const intent = translateArabicIntent('عيادات أسنان في القاهرة');
    assert.equal(intent.criteria.website, 'ANY');
    assert.equal(intent.criteria.social, 'ANY');
  });

  it('rejects rating outside 0-5 range', () => {
    const intent = translateArabicIntent('عيادات تقييم 6');
    assert.equal(intent.discovery.minRating, undefined);
    assert.equal(intent.criteria.minRating, undefined);
  });

  it('preserves rawQuery exactly as provided', () => {
    const raw = 'هاتلي 100 عيادة أسنان';
    const intent = translateArabicIntent(raw);
    assert.equal(intent.rawQuery, raw);
  });
});
