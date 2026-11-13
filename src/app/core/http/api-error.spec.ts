import { missingTranslations, useLanguageForTests } from '../i18n/i18n';
import { AR_COMMON } from '../i18n/ar/common';
import { AR_CORE } from '../i18n/ar/core';
import { apiErrorMessage, serverMessage } from './api-error';

const envelope = (message: string, status = 400) => ({ status, error: { success: false, message, data: null, errors: null } });

describe('apiErrorMessage', () => {
  afterEach(() => useLanguageForTests('en'));

  describe('in English', () => {
    it('shows the sentence of the server exactly as it came', () => {
      expect(apiErrorMessage(envelope('Email already registered.'))).toBe('Email already registered.');
      expect(apiErrorMessage(envelope('Title cannot exceed 200 characters.'))).toBe('Title cannot exceed 200 characters.');
      expect(apiErrorMessage({ status: 400, error: '{"message":"Invalid email or password."}' })).toBe('Invalid email or password.');
      expect(apiErrorMessage({ status: 409, error: 'Plain words from the server' })).toBe('Plain words from the server');
    });

    it('prefers the message of a field over the general title', () => {
      const problem = { status: 400, error: { title: 'One or more validation errors occurred.', errors: { Email: ['Email is required.'] } } };
      expect(apiErrorMessage(problem)).toBe('Email is required.');
    });

    it('has a sentence for a status without one', () => {
      expect(apiErrorMessage({ status: 0 })).toBe('Cannot reach the server. Check your connection and try again.');
      expect(apiErrorMessage({ status: 401 })).toBe('Your session has expired. Please sign in again.');
      expect(apiErrorMessage({ status: 403 })).toBe('You do not have permission to do that.');
      expect(apiErrorMessage({ status: 404 })).toBe('That item no longer exists.');
      expect(apiErrorMessage({ status: 409 })).toBe('That conflicts with something that already exists.');
      expect(apiErrorMessage({ status: 503 })).toBe('The server is currently unavailable. Please try again later.');
    });

    it('falls back to what the caller gave, or to the general sentence', () => {
      expect(apiErrorMessage({ status: 400 })).toBe('Something went wrong. Please try again.');
      expect(apiErrorMessage({ status: 400 }, 'Could not save.')).toBe('Could not save.');
      expect(apiErrorMessage({ status: 500, error: '<html>Bad gateway</html>' }))
        .toBe('The server is currently unavailable. Please try again later.');
      expect(apiErrorMessage('Typed by the caller')).toBe('Typed by the caller');
    });
  });

  describe('in Arabic', () => {
    const dictionary = { ...AR_COMMON, ...AR_CORE };

    it('says the sentences written here in Arabic', () => {
      useLanguageForTests('ar', { dictionary });

      expect(apiErrorMessage({ status: 0 })).toBe('تعذّر الوصول إلى الخادم. تحقق من اتصالك وحاول مرة أخرى.');
      expect(apiErrorMessage({ status: 404 })).toBe('هذا العنصر لم يعد موجودًا.');
      expect(apiErrorMessage({ status: 400 })).toBe('حدث خطأ ما. حاول مرة أخرى.');
      expect(apiErrorMessage({ status: 400 }, 'تعذّر الحفظ.')).toBe('تعذّر الحفظ.');
    });

    it('says a sentence of the server in Arabic when the dictionary lists it', () => {
      useLanguageForTests('ar', { dictionary });

      expect(apiErrorMessage(envelope('Email already registered.'))).toBe('البريد الإلكتروني مسجَّل بالفعل.');
      expect(apiErrorMessage({ status: 401, error: '{"message":"Invalid email or password."}' }))
        .toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      const problem = { status: 400, error: { title: 'One or more validation errors occurred.', errors: { Email: ['Email is required.'] } } };
      expect(apiErrorMessage(problem)).toBe('البريد الإلكتروني مطلوب.');
    });

    it('draws a number of the sentence in the digits chosen', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });
      expect(serverMessage('Title cannot exceed 200 characters.')).toBe('الحد الأقصى لعدد أحرف العنوان: ٢٠٠.');
      expect(serverMessage('A reminder can be set from 0 minutes up to 4 weeks before.'))
        .toBe('يمكن ضبط التذكير من ٠ دقيقة إلى ٤ أسابيع قبل الموعد.');

      useLanguageForTests('ar', { dictionary, numerals: 'latn' });
      expect(serverMessage('Title cannot exceed 200 characters.')).toBe('الحد الأقصى لعدد أحرف العنوان: 200.');
    });

    it('keeps a name the sentence carries', () => {
      useLanguageForTests('ar', { dictionary });

      expect(serverMessage('Omar Khaled is not online right now. They will see a missed call.'))
        .toBe('Omar Khaled غير متصل الآن. ستظهر له مكالمة فائتة.');
      expect(serverMessage('That kind of file cannot be attached. Allowed: pdf, png, jpg.'))
        .toBe('لا يمكن إرفاق هذا النوع من الملفات. الأنواع المسموحة: pdf, png, jpg.');
    });

    it('leaves a sentence it does not know as it came, and remembers it', () => {
      useLanguageForTests('ar', { dictionary });

      expect(serverMessage('The moon is 3 days late.')).toBe('The moon is 3 days late.');
      expect(missingTranslations()).toEqual(['The moon is {n} days late.']);
      expect(serverMessage('الاسم مطلوب.')).toBe('الاسم مطلوب.');
    });
  });
});
