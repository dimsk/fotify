import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Title,
  Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { Clock, Images, LayoutGrid, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type {
  CollageLayoutSelection,
  GrainEffect,
  PhotoCaptionPosition,
  PhotoFrameStyle,
  ShuffleMode,
  TransitionEffect,
} from '../../api/types';

const EFFECT_VALUES: TransitionEffect[] = [
  'fade',
  'crossfadeBlur',
  'crossZoom',
  'dipToBlack',
  'dipToWhite',
  'filmGrain',
  'colorBreath',
  'lightLeak',
  'vignettePulse',
  'rackFocus',
  'exposureFlash',
  'radialBloom',
  'duotone',
  'staggerFade',
  'dustParticles',
  'random',
];
const COLLAGE_LAYOUT_VALUES: CollageLayoutSelection[] = [
  'heartCutout',
  'heartMosaic',
  'diamondGridDense',
  'diamondGridLarge',
  'diamondClusterTight',
  'diamondClusterScatter',
  'heroWithSupporting',
  'threeTopTwoBottom',
  'scrapbookScatter',
  'editorialMasonry',
  'random',
];

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <Card withBorder padding="lg" radius="md" h="100%">
      <Group gap="xs" mb="md">
        {icon}
        <Title order={4}>{title}</Title>
      </Group>
      <Stack gap="md">{children}</Stack>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });

  const [effects, setEffects] = useState<TransitionEffect[]>(['fade']);
  const [imageSeconds, setImageSeconds] = useState(6);
  const [transitionMs, setTransitionMs] = useState(1200);
  const [cinematicChance, setCinematicChance] = useState(0);
  const [kenBurnsChance, setKenBurnsChance] = useState(0);
  const [avoidRepeats, setAvoidRepeats] = useState(false);
  const [adjacentPortraitTriples, setAdjacentPortraitTriples] = useState(true);
  const [photoFrameStyle, setPhotoFrameStyle] =
    useState<PhotoFrameStyle>('none');
  const [photoCaptionPosition, setPhotoCaptionPosition] =
    useState<PhotoCaptionPosition>('bottom-right');
  const [grainEffect, setGrainEffect] = useState<GrainEffect>('none');
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>('all');
  const [collageEnabled, setCollageEnabled] = useState(false);
  const [collageChance, setCollageChance] = useState(20);
  const [collageTimeWindowMinutes, setCollageTimeWindowMinutes] = useState(180);
  const [collageLayouts, setCollageLayouts] = useState<
    CollageLayoutSelection[]
  >(['random']);

  useEffect(() => {
    if (!settings) return;
    setEffects(settings.transitionEffects);
    setImageSeconds(Math.round(settings.imageDurationMs / 1000));
    setTransitionMs(settings.transitionDurationMs);
    setCinematicChance(settings.cinematicChance);
    setKenBurnsChance(settings.kenBurnsChance ?? 40);
    setAvoidRepeats(settings.avoidRepeats);
    setAdjacentPortraitTriples(settings.adjacentPortraitTriples);
    setPhotoFrameStyle(settings.photoFrameStyle);
    setPhotoCaptionPosition(settings.photoCaptionPosition);
    setGrainEffect(settings.grainEffect);
    setShuffleMode(settings.shuffleMode);
    setCollageEnabled(settings.collageEnabled);
    setCollageChance(settings.collageChance);
    setCollageTimeWindowMinutes(settings.collageTimeWindowMinutes);
    setCollageLayouts(settings.collageLayouts);
  }, [settings]);

  /**
   * "Random" means "pick from everything" and doesn't make sense combined
   * with specific choices, so the two are kept mutually exclusive: picking
   * Random clears everything else, and picking any specific effect while
   * Random is active drops Random instead of combining with it.
   */
  function handleEffectsChange(values: string[]) {
    const selected = values as TransitionEffect[];
    if (selected.length === 0) {
      setEffects(['fade']);
      return;
    }
    const hadRandom = effects.includes('random');
    const hasRandom = selected.includes('random');
    if (hasRandom && !hadRandom) {
      setEffects(['random']);
    } else if (hasRandom && hadRandom && selected.length > 1) {
      setEffects(selected.filter((e) => e !== 'random'));
    } else {
      setEffects(selected);
    }
  }

  /**
   * "Random" means "any of the 10 layouts may appear" and doesn't make
   * sense combined with specific choices — mirrors handleEffectsChange's
   * mutual-exclusivity handling for transitionEffects exactly.
   */
  function handleCollageLayoutsChange(values: string[]) {
    const selected = values as CollageLayoutSelection[];
    if (selected.length === 0) {
      setCollageLayouts(['random']);
      return;
    }
    const hadRandom = collageLayouts.includes('random');
    const hasRandom = selected.includes('random');
    if (hasRandom && !hadRandom) {
      setCollageLayouts(['random']);
    } else if (hasRandom && hadRandom && selected.length > 1) {
      setCollageLayouts(selected.filter((l) => l !== 'random'));
    } else {
      setCollageLayouts(selected);
    }
  }

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      notifications.show({
        message: t('common.settingsSaved'),
        color: 'teal',
      });
    },
  });

  function save() {
    updateMutation.mutate({
      transitionEffects: effects,
      imageDurationMs: imageSeconds * 1000,
      transitionDurationMs: transitionMs,
      cinematicChance,
      kenBurnsChance,
      avoidRepeats,
      adjacentPortraitTriples,
      photoFrameStyle,
      photoCaptionPosition,
      grainEffect,
      shuffleMode,
      collageEnabled,
      collageChance,
      collageTimeWindowMinutes,
      collageLayouts,
    });
  }

  const effectOptions = EFFECT_VALUES.map((value) => ({ value, label: t(`options.effects.${value}`) }));
  const shuffleModeOptions: { value: ShuffleMode; label: string }[] = [
    { value: 'all', label: t('options.shuffle.all') },
    { value: 'source-rotation', label: t('options.shuffle.sourceRotation') },
  ];
  const frameStyleOptions: { value: PhotoFrameStyle; label: string }[] = [
    { value: 'none', label: t('options.frames.none') },
    { value: 'thin', label: t('options.frames.thin') },
    { value: 'polaroid', label: t('options.frames.polaroid') },
  ];
  const captionPositionOptions: { value: PhotoCaptionPosition; label: string }[] = [
    { value: 'bottom-right', label: t('options.captions.bottomRight') },
    { value: 'bottom-left', label: t('options.captions.bottomLeft') },
  ];
  const grainEffectOptions: { value: GrainEffect; label: string }[] = [
    { value: 'none', label: t('options.grain.none') },
    { value: 'light', label: t('options.grain.light') },
    { value: 'strong', label: t('options.grain.strong') },
    { value: 'extreme', label: t('options.grain.extreme') },
  ];
  const collageLayoutOptions = COLLAGE_LAYOUT_VALUES.map((value) => ({
    value,
    label: t(`options.collages.${value}`),
  }));

  return (
    <Stack>
      <Title order={3}>{t('settings.title')}</Title>

      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        <Section icon={<Wand2 size={18} />} title={t('settings.transitions')}>
          <MultiSelect
            label={t('settings.transitionEffects')}
            description={t('settings.transitionEffectsDescription')}
            data={effectOptions}
            value={effects}
            onChange={handleEffectsChange}
            searchable
            clearable={false}
          />

          <NumberInput
            label={t('settings.transitionDuration')}
            min={200}
            max={5000}
            step={100}
            value={transitionMs}
            onChange={(v) => setTransitionMs(Number(v) || 200)}
          />

          <NumberInput
            label={t('settings.cinematicChance')}
            description={t('settings.cinematicChanceDescription')}
            min={0}
            max={100}
            value={cinematicChance}
            onChange={(v) => setCinematicChance(Number(v) || 0)}
          />

          <NumberInput
            label={t('settings.kenBurnsChance')}
            description={t('settings.kenBurnsChanceDescription')}
            min={0}
            max={100}
            value={kenBurnsChance}
            onChange={(v) => setKenBurnsChance(Number(v) || 0)}
          />
        </Section>

        <Section icon={<Clock size={18} />} title={t('settings.playback')}>
          <NumberInput
            label={t('settings.imageDuration')}
            min={1}
            max={120}
            value={imageSeconds}
            onChange={(v) => setImageSeconds(Number(v) || 1)}
          />

          <Select
            label={t('settings.playbackOrder')}
            data={shuffleModeOptions}
            value={shuffleMode}
            onChange={(v) => v && setShuffleMode(v as ShuffleMode)}
            allowDeselect={false}
          />

          <Switch
            label={t('settings.avoidRepeats')}
            description={t('settings.avoidRepeatsDescription')}
            checked={avoidRepeats}
            onChange={(e) => setAvoidRepeats(e.currentTarget.checked)}
          />
        </Section>

        <Section icon={<Images size={18} />} title={t('settings.imageSelection')}>
          <Switch
            label={t('settings.groupPortraits')}
            description={t('settings.groupPortraitsDescription')}
            checked={adjacentPortraitTriples}
            onChange={(e) =>
              setAdjacentPortraitTriples(e.currentTarget.checked)
            }
          />

          <Select
            label={t('settings.photoFrame')}
            description={t('settings.photoFrameDescription')}
            data={frameStyleOptions}
            value={photoFrameStyle}
            onChange={(v) => v && setPhotoFrameStyle(v as PhotoFrameStyle)}
            allowDeselect={false}
          />

          <Select
            label={t('settings.caption')}
            description={t('settings.captionDescription')}
            data={captionPositionOptions}
            value={photoCaptionPosition}
            onChange={(v) =>
              v && setPhotoCaptionPosition(v as PhotoCaptionPosition)
            }
            allowDeselect={false}
          />

          <Select
            label={t('settings.grain')}
            description={t('settings.grainDescription')}
            data={grainEffectOptions}
            value={grainEffect}
            onChange={(v) => v && setGrainEffect(v as GrainEffect)}
            allowDeselect={false}
          />
        </Section>

        <Section icon={<LayoutGrid size={18} />} title={t('settings.collages')}>
          <Switch
            label={t('settings.enableCollages')}
            description={t('settings.enableCollagesDescription')}
            checked={collageEnabled}
            onChange={(e) => setCollageEnabled(e.currentTarget.checked)}
          />

          <NumberInput
            label={t('settings.probability')}
            min={0}
            max={100}
            value={collageChance}
            onChange={(v) => setCollageChance(Number(v) || 0)}
            disabled={!collageEnabled}
          />

          <NumberInput
            label={t('settings.timeWindow')}
            description={t('settings.timeWindowDescription')}
            min={1}
            value={collageTimeWindowMinutes}
            onChange={(v) => setCollageTimeWindowMinutes(Number(v) || 1)}
            disabled={!collageEnabled}
          />

          <MultiSelect
            label={t('settings.layoutTypes')}
            description={t('settings.layoutTypesDescription')}
            data={collageLayoutOptions}
            value={collageLayouts}
            onChange={handleCollageLayoutsChange}
            searchable
            clearable={false}
            disabled={!collageEnabled}
          />
        </Section>
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        {t('common.changesApplyNextSlide')}
      </Text>

      <Button
        onClick={save}
        loading={updateMutation.isPending}
        w={{ base: '100%', sm: 200 }}
      >
        {t('common.save')}
      </Button>
    </Stack>
  );
}
