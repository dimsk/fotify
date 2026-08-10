import { validate } from 'class-validator';
import { UpdateSettingsDto } from './update-settings.dto';

describe('UpdateSettingsDto video settings', () => {
  it('accepts the random segment playback mode', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      videoCompatibilityMode: 'direct-common',
      videoDurationMode: 'random-segment',
      videoMaxDurationMs: 30_000,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unsupported playback modes', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      videoDurationMode: 'unsupported',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
