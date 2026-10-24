import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MAT_NATIVE_DATE_FORMATS,
  MatDateFormats,
  NativeDateAdapter
} from '@angular/material/core';

/*
 * How every date field in the app reads and shows dates. Fixed for now: US month/day/year whatever
 * the user's region. A later user setting ("automatic by region" or a fixed format) changes it here,
 * and only here.
 */

export const APP_DATE_LOCALE = 'en-US';

/**
 * The format the date fields show as their placeholder. It must match display.dateInput in
 * APP_DATE_FORMATS and what AppDateAdapter.parse reads: change the three together.
 */
export const DATE_INPUT_PLACEHOLDER = 'MM/DD/YYYY';

export const APP_DATE_FORMATS: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    // Two digits, so a picked date reads exactly like the placeholder: 01/05/2026, not 1/5/2026.
    dateInput: { year: 'numeric', month: '2-digit', day: '2-digit' }
  }
};

const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Typed dates become local midnight, as picked ones do. The native adapter hands text to Date.parse,
 * which reads 2026-11-02 as UTC midnight: the evening before, west of UTC.
 */
@Injectable()
export class AppDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value === 'string') {
      const text = value.trim();
      const us = US_DATE.exec(text);
      if (us) return this.localDate(+us[3], +us[1], +us[2]);
      const iso = ISO_DATE.exec(text);
      if (iso) return this.localDate(+iso[1], +iso[2], +iso[3]);
    }
    return super.parse(value, parseFormat);
  }

  /** The date at local midnight, or an invalid date for a day that doesn't exist (02/30/2026). */
  private localDate(year: number, month: number, day: number): Date {
    const date = new Date(year, month - 1, day);
    // new Date(…) would roll 30 February over into March; refuse it instead.
    date.setFullYear(year);
    const exists = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return exists ? date : this.invalid();
  }
}

/** The app's date adapter, formats and locale; app.config provides them once, for every field and popup. */
export function provideAppDateFormat(): Provider[] {
  return [
    { provide: DateAdapter, useClass: AppDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: APP_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: APP_DATE_LOCALE }
  ];
}
