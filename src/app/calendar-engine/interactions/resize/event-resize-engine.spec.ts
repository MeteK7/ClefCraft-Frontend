import { EventResizeEngine } from './event-resize-engine';
import { TimeBlockEngine } from '../../layout/time-block-engine';

describe('EventResizeEngine', () => {
  const halfHourPx = TimeBlockEngine.HOUR_HEIGHT / 2;
  const start = () => new Date(2026, 4, 13, 9, 0);
  const end = () => new Date(2026, 4, 13, 10, 0);

  it('moves only the start when resizing from the top', () => {
    expect(EventResizeEngine.resizeTop(start(), end(), halfHourPx))
      .toEqual({ start: new Date(2026, 4, 13, 9, 30), end: end() });
    expect(EventResizeEngine.resizeTop(start(), end(), -halfHourPx))
      .toEqual({ start: new Date(2026, 4, 13, 8, 30), end: end() });
  });

  it('keeps at least 15 minutes when the top is dragged past the end', () => {
    expect(EventResizeEngine.resizeTop(start(), end(), halfHourPx * 4))
      .toEqual({ start: new Date(2026, 4, 13, 9, 45), end: end() });
  });

  it('moves only the end when resizing from the bottom', () => {
    expect(EventResizeEngine.resizeBottom(start(), end(), halfHourPx))
      .toEqual({ start: start(), end: new Date(2026, 4, 13, 10, 30) });
  });

  it('keeps at least 15 minutes when the bottom is dragged past the start', () => {
    expect(EventResizeEngine.resizeBottom(start(), end(), -halfHourPx * 4))
      .toEqual({ start: start(), end: new Date(2026, 4, 13, 9, 15) });
  });

  it('does not change the dates it is given', () => {
    const s = start();
    const e = end();

    EventResizeEngine.resizeTop(s, e, halfHourPx);
    EventResizeEngine.resizeBottom(s, e, halfHourPx);

    expect(s).toEqual(start());
    expect(e).toEqual(end());
  });
});
