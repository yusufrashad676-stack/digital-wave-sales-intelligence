import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectContactForm,
  extractBookingPageUrl,
  extractContactPageUrl,
  extractEmails,
  extractWhatsappUrl,
} from './http-website-enrichment.provider.js';

const HTML_WITH_EVERYTHING = `
<html>
  <head><title>Test</title></head>
  <body>
    <a href="mailto:Info@Test-Dental.COM?subject=hi">Email us</a>
    <a href="mailto:second@business.com">Second</a>
    <a href="/contact-us">Contact us</a>
    <a href="/book-an-appointment">Book an appointment</a>
    <a href="https://wa.me/201001234567">WhatsApp</a>
    <form>
      <input type="email" name="email" />
    </form>
    <p>Reach us at hello@business.com for questions.</p>
  </body>
</html>
`;

describe('HttpWebsiteEnrichmentProvider — R3 observation extraction (offline)', () => {
  it('C: extracts observed email addresses from mailto links and page text, bounded and deduplicated', () => {
    const emails = extractEmails(HTML_WITH_EVERYTHING);
    assert.deepEqual(emails.sort(), ['hello@business.com', 'info@test-dental.com', 'second@business.com'].sort());
    // Bounded: even with many candidates, at most MAX_EMAILS (10) are returned.
    const noisy = '<a href="mailto:a@e.com">a</a>'.repeat(50);
    assert.ok(extractEmails(noisy).length <= 10);
  });

  it('C2: an invalid candidate inside page text is ignored (not guessed)', () => {
    assert.deepEqual(extractEmails('text@invalid'), []);
    assert.deepEqual(extractEmails('<a href="mailto:x@y">ok</a>'), []);
  });

  it('J: capability observations are detectable from the homepage', () => {
    assert.equal(extractContactPageUrl(HTML_WITH_EVERYTHING), '/contact-us');
    assert.equal(extractBookingPageUrl(HTML_WITH_EVERYTHING), '/book-an-appointment');
    assert.equal(extractWhatsappUrl(HTML_WITH_EVERYTHING), 'https://wa.me/201001234567');
    assert.equal(detectContactForm(HTML_WITH_EVERYTHING), true);
  });

  it('J2: absent capability observations yield false/null (UNKNOWN != ABSENT)', () => {
    const bare = '<html><body><p>no features here</p></body></html>';
    assert.equal(extractContactPageUrl(bare), null);
    assert.equal(extractBookingPageUrl(bare), null);
    assert.equal(extractWhatsappUrl(bare), null);
    assert.equal(detectContactForm(bare), false);
  });

  it('J3: a plain form without contact fields is NOT a contact form', () => {
    assert.equal(detectContactForm('<form><input type="text" name="search"></form>'), false);
  });
});
