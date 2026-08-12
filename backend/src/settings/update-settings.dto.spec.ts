import { validate } from 'class-validator';
import { UpdateSettingsDto } from './update-settings.dto';

describe('UpdateSettingsDto video settings', () => {
  it('accepts a duration mode with the random-segment toggle', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      videoCompatibilityMode: 'direct-common',
      videoDurationMode: 'photo',
      videoMaxDurationMs: 30_000,
      videoRandomSegmentEnabled: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unsupported playback modes', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      videoDurationMode: 'unsupported',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects the removed random-segment duration mode', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      videoDurationMode: 'random-segment',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

describe('UpdateSettingsDto playbackMode', () => {
  it.each(['all', 'images-only', 'videos-only'] as const)(
    'accepts playbackMode "%s"',
    async (playbackMode) => {
      const dto = Object.assign(new UpdateSettingsDto(), { playbackMode });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('rejects an unknown playbackMode', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      playbackMode: 'unsupported',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
