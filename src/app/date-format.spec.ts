import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_FORMATS, MatDateFormats } from '@angular/material/core';

import { appConfig } from './app.config';
import { AppDateAdapter, DATE_INPUT_PLACEHOLDER, provideAppDateFormat } from './date-format';

describe('date-format', () => {
  let adapter: DateAdapter<Date>;
  let formats: MatDateFormats;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppDateFormat()] });
    adapter = TestBed.inject(DateAdapter);
    formats = TestBed.inject(MAT_DATE_FORMATS);
  });

  const isLocalDay = (date: Date | null, year: number, month: number, day: number) =>
    !!date && adapter.isValid(date)
    && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && date.getHours() === 0 && date.getMinutes() === 0;

  it('shows dates exactly as the placeholder describes them', () => {
    expect(DATE_INPUT_PLACEHOLDER).toBe('MM/DD/YYYY');
    expect(adapter.format(new Date(2026, 0, 5), formats.display.dateInput)).toBe('01/05/2026');
    expect(adapter.format(new Date(2026, 10, 2), formats.display.dateInput)).toBe('11/02/2026');
  });

  it('reads MM/DD/YYYY as that day at local midnight, with or without leading zeros', () => {
    expect(isLocalDay(adapter.parse('01/05/2026', null), 2026, 1, 5)).toBeTrue();
    expect(isLocalDay(adapter.parse('1/5/2026', null), 2026, 1, 5)).toBeTrue();
    expect(isLocalDay(adapter.parse(' 11/02/2026 ', null), 2026, 11, 2)).toBeTrue();
  });

  it('reads an ISO date as that day at local midnight, not UTC midnight', () => {
    // Date.parse would make this 2 November 00:00 UTC: 1 November in the evening, west of UTC.
    expect(isLocalDay(adapter.parse('2026-11-02', null), 2026, 11, 2)).toBeTrue();
  });

  it('refuses days that do not exist instead of rolling them over', () => {
    for (const text of ['02/30/2026', '13/01/2026', '2026-02-29', '00/10/2026']) {
      const parsed = adapter.parse(text, null);
      expect(parsed && adapter.isValid(parsed)).withContext(text).toBeFalsy();
    }
    expect(isLocalDay(adapter.parse('02/29/2028', null), 2028, 2, 29)).toBeTrue();
  });

  it('leaves empty input empty', () => {
    expect(adapter.parse('', null)).toBeNull();
    expect(adapter.parse(null, null)).toBeNull();
  });

  it('is provided at the root, so date pickers\' calendar popups find it too', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: appConfig.providers });

    expect(TestBed.inject(DateAdapter)).toBeInstanceOf(AppDateAdapter);
    expect(TestBed.inject(MAT_DATE_FORMATS).display.dateInput).toEqual(formats.display.dateInput);
  });
});
