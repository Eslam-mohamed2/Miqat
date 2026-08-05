import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/**
 * Mirrors the API's registration rules exactly, as reported by its 400 responses:
 * at least 8 characters, one uppercase letter, one number, one special character.
 *
 * The special-character test accepts any non-alphanumeric character. The previous
 * regex only allowed `@$!%*?&`, so passwords the API accepts (`#`, `-`, `_`, …)
 * were rejected client-side and could never be submitted.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function strongPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value ?? '';
    if (!value) return null; // `required` reports emptiness

    const errors: ValidationErrors = {};
    if (value.length < PASSWORD_MIN_LENGTH) errors['minlength'] = true;
    if (!/[A-Z]/.test(value)) errors['uppercase'] = true;
    if (!/\d/.test(value)) errors['number'] = true;
    if (!/[^A-Za-z0-9]/.test(value)) errors['special'] = true;

    return Object.keys(errors).length ? errors : null;
  };
}

/** `required` + the API's complexity rules, for any new-password field. */
export const passwordValidators = [Validators.required, strongPasswordValidator()];

/** Group-level check that two password fields match. */
export function passwordsMatchValidator(
  passwordField: string,
  confirmField: string
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = (group as FormGroup).get(passwordField)?.value;
    const confirm = (group as FormGroup).get(confirmField)?.value;
    if (!password || !confirm) return null;
    return password === confirm ? null : { mismatch: true };
  };
}

/** First human-readable message for a failed password control. */
export function passwordErrorMessage(errors: ValidationErrors | null): string {
  if (!errors) return '';
  if (errors['required']) return 'Password is required.';
  if (errors['minlength']) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (errors['uppercase']) return 'Password must contain at least one uppercase letter.';
  if (errors['number']) return 'Password must contain at least one number.';
  if (errors['special']) return 'Password must contain at least one special character.';
  return 'Password is invalid.';
}
