import { TestBed } from '@angular/core/testing';

import { AR, AR_PLURALS } from '../../core/i18n/ar';
import { useLanguageForTests } from '../../core/i18n/i18n';
import { AttachmentDto } from '../../models/api.models';
import { TEST_PROVIDERS } from '../../../testing/test-providers';
import { ItemAttachments } from './item-attachments';

function file(changes: Partial<AttachmentDto> = {}): AttachmentDto {
  return {
    id: 'f1', itemKind: 'Task', itemId: 't1', fileName: 'notes.txt', contentType: 'text/plain', sizeBytes: 1536,
    uploadedByUserId: 'u1', uploadedByName: 'Sarah Johnson', createdAt: '2026-11-12T12:00:00Z',
    downloadUrl: '/api/Attachment/f1', ...changes
  };
}

/** What the file rows say, in both languages. The list itself is not loaded here. */
describe('ItemAttachments', () => {
  let files: ItemAttachments;

  function create() {
    TestBed.configureTestingModule({ imports: [ItemAttachments], providers: TEST_PROVIDERS });
    files = TestBed.createComponent(ItemAttachments).componentInstance;
  }

  afterEach(() => useLanguageForTests('en'));

  describe('in English', () => {
    beforeEach(() => {
      useLanguageForTests('en');
      create();
    });

    it('writes sizes as it always did', () => {
      expect(files.size(512)).toBe('512 B');
      expect(files.size(1536)).toBe('1.5 KB');
      expect(files.size(20 * 1024)).toBe('20 KB');
      expect(files.size(1000 * 1024)).toBe('1000 KB');
      expect(files.size(1_600_000)).toBe('1.5 MB');
    });

    it('tags a file by its kind', () => {
      expect(files.tag(file({ contentType: 'image/png', fileName: 'hero.png' }))).toBe('IMG');
      expect(files.tag(file({ contentType: 'application/pdf', fileName: 'brief.pdf' }))).toBe('PDF');
      expect(files.tag(file({ contentType: 'text/plain', fileName: 'notes.txt' }))).toBe('TXT');
      expect(files.tag(file({ contentType: 'application/octet-stream', fileName: 'README' }))).toBe('FILE');
    });

    it('says who added the file and when, with nothing added to the name', () => {
      expect(files.details(file())).toBe('1.5 KB · Sarah Johnson · Nov 12');
    });
  });

  describe('in Arabic', () => {
    beforeEach(() => {
      useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS });
      create();
    });

    it('writes sizes in Arabic digits, with the Arabic decimal mark and unit', () => {
      expect(files.size(512)).toBe('٥١٢ بايت');
      expect(files.size(1536)).toBe('١٫٥ كيلوبايت');
      expect(files.size(1_600_000)).toBe('١٫٥ ميغابايت');
    });

    it('translates the words among the tags and keeps the names of formats', () => {
      expect(files.tag(file({ contentType: 'image/png', fileName: 'hero.png' }))).toBe('صورة');
      expect(files.tag(file({ contentType: 'application/pdf', fileName: 'brief.pdf' }))).toBe('PDF');
      expect(files.tag(file({ contentType: 'application/octet-stream', fileName: 'README' }))).toBe('ملف');
    });

    it('keeps a Latin name from pulling the date to its side', () => {
      expect(files.details(file())).toBe('١٫٥ كيلوبايت · ⁨Sarah Johnson⁩ · ١٢ نوفمبر');
    });
  });

  it('keeps 0-9 in Arabic when the digit choice is 123', () => {
    useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS, numerals: 'latn' });
    create();
    expect(files.size(512)).toBe('512 بايت');
    expect(files.details(file())).toContain('12 نوفمبر');
  });
});
