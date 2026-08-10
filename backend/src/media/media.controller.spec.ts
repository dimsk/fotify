import { parseByteRange } from './media.controller';

describe('parseByteRange', () => {
  it('parses bounded, open-ended, and suffix ranges', () => {
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  });

  it('clamps an end beyond the file and rejects invalid ranges', () => {
    expect(parseByteRange('bytes=90-200', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=100-', 100)).toBeNull();
    expect(parseByteRange('bytes=20-10', 100)).toBeNull();
    expect(parseByteRange('items=0-10', 100)).toBeNull();
  });
});
