import { HttpErrorResponse } from '@angular/common/http';

import { ATTACHMENT_LIMITS, stageWithinLimits, uploadFailureMessage } from './attachment-limits';

// Only name and size are read, so plain objects stand in for (potentially huge) Files.
const file = (name: string, size: number) => ({ name, size }) as File;
const MB = 1024 * 1024;

describe('attachment-limits', () => {
  describe('stageWithinLimits', () => {
    it('accepts files of any type within the limits', () => {
      const picked = [file('take.wav', 90 * MB), file('riff.gp5', 1), file('setup.exe', 5 * MB)];

      expect(stageWithinLimits([], picked)).toEqual({ accepted: picked, error: null });
    });

    it('rejects a file over 100 MB but keeps the others', () => {
      const ok = file('score.pdf', MB);
      const result = stageWithinLimits([], [file('concert.mp4', ATTACHMENT_LIMITS.maxFileSizeBytes + 1), ok]);

      expect(result.accepted).toEqual([ok]);
      expect(result.error).toBe('"concert.mp4" is larger than 100 MB.');
    });

    it('stops at 10 files, counting those already staged', () => {
      const staged = Array.from({ length: 9 }, (_, i) => file(`s${i}.txt`, 1));
      const result = stageWithinLimits(staged, [file('tenth.txt', 1), file('eleventh.txt', 1)]);

      expect(result.accepted.map(f => f.name)).toEqual(['tenth.txt']);
      expect(result.error).toBe('You can upload at most 10 files at a time.');
    });

    it('stops at 500 MB in total, counting those already staged', () => {
      const staged = Array.from({ length: 5 }, (_, i) => file(`take${i}.wav`, 90 * MB)); // 450 MB
      const result = stageWithinLimits(staged, [file('one-more.wav', 60 * MB)]);

      expect(result.accepted).toEqual([]);
      expect(result.error).toBe('An upload can be at most 500 MB in total.');
    });

    it('rejects an empty file', () => {
      expect(stageWithinLimits([], [file('blank.txt', 0)]).error).toBe('"blank.txt" is empty.');
    });
  });

  describe('uploadFailureMessage', () => {
    it('shows the first validation error from the API', () => {
      const err = new HttpErrorResponse({
        status: 400,
        error: { title: "Some files can't be uploaded.", errors: { Files: ['You can upload at most 10 files at a time.'] } }
      });

      expect(uploadFailureMessage(err)).toBe('Attachments not uploaded: You can upload at most 10 files at a time.');
    });

    it('explains a 413', () => {
      expect(uploadFailureMessage(new HttpErrorResponse({ status: 413 }))).toContain('too large');
    });

    it('falls back to a generic message', () => {
      expect(uploadFailureMessage(new HttpErrorResponse({ status: 500 }))).toBe('Attachments could not be uploaded. Please try again.');
    });
  });
});
