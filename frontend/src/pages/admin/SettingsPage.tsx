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
  TextInput,
  Title,
  Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { CalendarClock, Clock, Images, LayoutGrid, Wand2 } from 'lucide-react';
import { api } from '../../api/client';
import type {
  CollageLayoutSelection,
  GrainEffect,
  PhotoCaptionPosition,
  PhotoFrameStyle,
  ShuffleMode,
  TransitionEffect,
} from '../../api/types';

const EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: 'fade', label: 'Überblenden (Fade)' },
  { value: 'zoom', label: 'Zoom / Ken Burns' },
  { value: 'crossfadeBlur', label: 'Weichzeichner-Überblendung' },
  { value: 'crossZoom', label: 'Sanfter Zoom-Übergang' },
  { value: 'dipToBlack', label: 'Abblenden zu Schwarz' },
  { value: 'dipToWhite', label: 'Aufblenden zu Weiß' },
  { value: 'filmGrain', label: 'Film-Überblendung' },
  { value: 'colorBreath', label: 'Farbatmung' },
  { value: 'lightLeak', label: 'Lichteinfall' },
  { value: 'vignettePulse', label: 'Vignetten-Puls' },
  { value: 'rackFocus', label: 'Fokus-Wechsel' },
  { value: 'exposureFlash', label: 'Belichtungsblitz' },
  { value: 'radialBloom', label: 'Lichtschimmer' },
  { value: 'duotone', label: 'Duoton-Wechsel' },
  { value: 'staggerFade', label: 'Gestaffeltes Einblenden (3er-Bilder)' },
  { value: 'dustParticles', label: 'Staubpartikel' },
  { value: 'random', label: 'Zufällig' },
];

const SHUFFLE_MODE_OPTIONS: { value: ShuffleMode; label: string }[] = [
  { value: 'all', label: 'Alle Ordner mischen' },
  { value: 'source-rotation', label: 'Ordner nacheinander (je 1 Stunde)' },
];

const FRAME_STYLE_OPTIONS: { value: PhotoFrameStyle; label: string }[] = [
  { value: 'none', label: 'Kein Rahmen' },
  { value: 'thin', label: 'Dünner Rahmen' },
  { value: 'polaroid', label: 'Polaroid' },
];

const CAPTION_POSITION_OPTIONS: {
  value: PhotoCaptionPosition;
  label: string;
}[] = [
  { value: 'bottom-right', label: 'Unten rechts' },
  { value: 'bottom-left', label: 'Unten links' },
];

const GRAIN_EFFECT_OPTIONS: { value: GrainEffect; label: string }[] = [
  { value: 'none', label: 'Kein Grain' },
  { value: 'light', label: 'Leichtes Grain' },
  { value: 'strong', label: 'Starkes Grain' },
];

const COLLAGE_LAYOUT_OPTIONS: {
  value: CollageLayoutSelection;
  label: string;
}[] = [
  { value: 'heartCutout', label: 'Herz-Ausschnitt (4 Fotos + Herz-Foto)' },
  { value: 'heartMosaic', label: 'Herz-Mosaik (10 Fotos)' },
  { value: 'diamondGridDense', label: 'Rautenraster (dicht, 12 Fotos)' },
  { value: 'diamondGridLarge', label: 'Rautenraster (groß, 8 Fotos)' },
  { value: 'diamondClusterTight', label: 'Rauten-Mosaik (kompakt, 9 Fotos)' },
  {
    value: 'diamondClusterScatter',
    label: 'Rauten-Mosaik (verstreut, 11 Fotos)',
  },
  {
    value: 'heroWithSupporting',
    label: 'Hauptbild mit Nebenbildern (8 Fotos)',
  },
  { value: 'threeTopTwoBottom', label: '3 oben, 2 unten (5 Fotos)' },
  { value: 'scrapbookScatter', label: 'Scrapbook, verstreut (10 Fotos)' },
  { value: 'editorialMasonry', label: 'Redaktionelles Mosaik (12 Fotos)' },
  { value: 'random', label: 'Zufällig' },
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
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });

  const [effects, setEffects] = useState<TransitionEffect[]>(['fade']);
  const [imageSeconds, setImageSeconds] = useState(6);
  const [transitionMs, setTransitionMs] = useState(1200);
  const [cinematicChance, setCinematicChance] = useState(0);
  const [avoidRepeats, setAvoidRepeats] = useState(false);
  const [adjacentPortraitTriples, setAdjacentPortraitTriples] = useState(true);
  const [photoFrameStyle, setPhotoFrameStyle] =
    useState<PhotoFrameStyle>('none');
  const [photoCaptionPosition, setPhotoCaptionPosition] =
    useState<PhotoCaptionPosition>('bottom-right');
  const [grainEffect, setGrainEffect] = useState<GrainEffect>('none');
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>('all');
  const [nightModeEnabled, setNightModeEnabled] = useState(false);
  const [nightModeStart, setNightModeStart] = useState('22:00');
  const [nightModeEnd, setNightModeEnd] = useState('07:00');
  const [autoRescanEnabled, setAutoRescanEnabled] = useState(false);
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
    setAvoidRepeats(settings.avoidRepeats);
    setAdjacentPortraitTriples(settings.adjacentPortraitTriples);
    setPhotoFrameStyle(settings.photoFrameStyle);
    setPhotoCaptionPosition(settings.photoCaptionPosition);
    setGrainEffect(settings.grainEffect);
    setShuffleMode(settings.shuffleMode);
    setNightModeEnabled(settings.nightModeEnabled);
    setNightModeStart(settings.nightModeStart);
    setNightModeEnd(settings.nightModeEnd);
    setAutoRescanEnabled(settings.autoRescanEnabled);
    setCollageEnabled(settings.collageEnabled);
    setCollageChance(settings.collageChance);
    setCollageTimeWindowMinutes(settings.collageTimeWindowMinutes);
    setCollageLayouts(settings.collageLayouts);
  }, [settings]);

  /**
   * "Zufällig" means "pick from everything" and doesn't make sense combined
   * with specific choices, so the two are kept mutually exclusive: picking
   * Zufällig clears everything else, and picking any specific effect while
   * Zufällig is active drops Zufällig instead of combining with it.
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
   * "Zufällig" means "any of the 10 layouts may appear" and doesn't make
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
        message: 'Einstellungen gespeichert',
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
      avoidRepeats,
      adjacentPortraitTriples,
      photoFrameStyle,
      photoCaptionPosition,
      grainEffect,
      shuffleMode,
      nightModeEnabled,
      nightModeStart,
      nightModeEnd,
      autoRescanEnabled,
      collageEnabled,
      collageChance,
      collageTimeWindowMinutes,
      collageLayouts,
    });
  }

  return (
    <Stack>
      <Title order={3}>Diashow-Einstellungen</Title>

      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        <Section icon={<Wand2 size={18} />} title="Übergänge">
          <MultiSelect
            label="Übergangseffekte"
            description="Mehrere auswählen, um zufällig zwischen ihnen zu wechseln. 'Zufällig' wählt aus allen Effekten und schließt eine gezielte Auswahl aus."
            data={EFFECT_OPTIONS}
            value={effects}
            onChange={handleEffectsChange}
            searchable
            clearable={false}
          />

          <NumberInput
            label="Übergangsdauer (Millisekunden)"
            min={200}
            max={5000}
            step={100}
            value={transitionMs}
            onChange={(v) => setTransitionMs(Number(v) || 200)}
          />

          <NumberInput
            label="Cinematic-Look-Wahrscheinlichkeit (%)"
            description="Wendet zufällig auf einen Teil der Bilder einen filmischen Farblook an (Teal & Orange). Der Übergang ist in diesem Fall immer ein Überblenden."
            min={0}
            max={100}
            value={cinematicChance}
            onChange={(v) => setCinematicChance(Number(v) || 0)}
          />
        </Section>

        <Section icon={<Clock size={18} />} title="Wiedergabe">
          <NumberInput
            label="Anzeigedauer pro Bild (Sekunden)"
            min={1}
            max={120}
            value={imageSeconds}
            onChange={(v) => setImageSeconds(Number(v) || 1)}
          />

          <Select
            label="Wiedergabe-Reihenfolge"
            data={SHUFFLE_MODE_OPTIONS}
            value={shuffleMode}
            onChange={(v) => v && setShuffleMode(v as ShuffleMode)}
            allowDeselect={false}
          />

          <Switch
            label="Bereits gezeigte Bilder erst nach vollem Durchlauf wiederholen"
            description="Wenn aktiv, werden noch nie gezeigte Bilder bevorzugt; bereits gezeigte kommen erst wieder dran, wenn alle einmal gezeigt wurden."
            checked={avoidRepeats}
            onChange={(e) => setAvoidRepeats(e.currentTarget.checked)}
          />
        </Section>

        <Section icon={<Images size={18} />} title="Bildauswahl">
          <Switch
            label="Zusammengehörige Hochformat-Bilder gruppieren"
            description="Wenn aktiv, werden bei einer 3er-Hochformat-Anzeige Bilder bevorzugt, die im Quellordner nebeneinander liegen (z. B. eine Fotoserie). Wenn aus, werden alle drei rein zufällig gewählt."
            checked={adjacentPortraitTriples}
            onChange={(e) =>
              setAdjacentPortraitTriples(e.currentTarget.checked)
            }
          />

          <Select
            label="Bilderrahmen"
            description="Dezenter optischer Rahmen um jedes angezeigte Foto."
            data={FRAME_STYLE_OPTIONS}
            value={photoFrameStyle}
            onChange={(v) => v && setPhotoFrameStyle(v as PhotoFrameStyle)}
            allowDeselect={false}
          />

          <Select
            label="Zeitstempel und Ort"
            description="Position der Foto-Beschriftung in der Diashow."
            data={CAPTION_POSITION_OPTIONS}
            value={photoCaptionPosition}
            onChange={(v) =>
              v && setPhotoCaptionPosition(v as PhotoCaptionPosition)
            }
            allowDeselect={false}
          />

          <Select
            label="Grain Overlay"
            description="Feine Filmkorn-Struktur als globales Overlay über der gesamten Diashow."
            data={GRAIN_EFFECT_OPTIONS}
            value={grainEffect}
            onChange={(v) => v && setGrainEffect(v as GrainEffect)}
            allowDeselect={false}
          />
        </Section>

        <Section icon={<CalendarClock size={18} />} title="Zeitplan">
          <Switch
            label="Nachtruhe"
            description="Zeigt außerhalb der angegebenen Zeitspanne einen leeren Bildschirm statt Fotos. Die Warteschlange bleibt dabei erhalten und läuft beim Aufwachen genau dort weiter."
            checked={nightModeEnabled}
            onChange={(e) => setNightModeEnabled(e.currentTarget.checked)}
          />

          <Group grow>
            <TextInput
              type="time"
              label="Beginn"
              value={nightModeStart}
              onChange={(e) => setNightModeStart(e.currentTarget.value)}
              disabled={!nightModeEnabled}
            />
            <TextInput
              type="time"
              label="Ende"
              value={nightModeEnd}
              onChange={(e) => setNightModeEnd(e.currentTarget.value)}
              disabled={!nightModeEnabled}
            />
          </Group>

          <Switch
            label="Automatischer täglicher Rescan"
            description="Scannt alle nicht pausierten Quellen einmal täglich automatisch neu, zusätzlich zum manuellen Neu-scannen."
            checked={autoRescanEnabled}
            onChange={(e) => setAutoRescanEnabled(e.currentTarget.checked)}
          />
        </Section>

        <Section icon={<LayoutGrid size={18} />} title="Collagen">
          <Switch
            label="Collagen aktivieren"
            description="Setzt gelegentlich mehrere zeitlich nah beieinander aufgenommene Fotos (z. B. ein Nachmittag im Urlaub) zu einer gemeinsamen Ansicht zusammen."
            checked={collageEnabled}
            onChange={(e) => setCollageEnabled(e.currentTarget.checked)}
          />

          <NumberInput
            label="Wahrscheinlichkeit (%)"
            min={0}
            max={100}
            value={collageChance}
            onChange={(v) => setCollageChance(Number(v) || 0)}
            disabled={!collageEnabled}
          />

          <NumberInput
            label="Zeitfenster (Minuten)"
            description="Wie nah beieinander die Aufnahmezeitpunkte liegen müssen, um zusammen in einer Collage zu landen."
            min={1}
            value={collageTimeWindowMinutes}
            onChange={(v) => setCollageTimeWindowMinutes(Number(v) || 1)}
            disabled={!collageEnabled}
          />

          <MultiSelect
            label="Layout-Typen"
            description="Welche der 10 Collagen-Layouts vorkommen dürfen. 'Zufällig' wählt aus allen Layouts und schließt eine gezielte Auswahl aus."
            data={COLLAGE_LAYOUT_OPTIONS}
            value={collageLayouts}
            onChange={handleCollageLayoutsChange}
            searchable
            clearable={false}
            disabled={!collageEnabled}
          />
        </Section>
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Änderungen wirken sich ab dem nächsten Bildwechsel in der Diashow aus.
      </Text>

      <Button
        onClick={save}
        loading={updateMutation.isPending}
        w={{ base: '100%', sm: 200 }}
      >
        Speichern
      </Button>
    </Stack>
  );
}
