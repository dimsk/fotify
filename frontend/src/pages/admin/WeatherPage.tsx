import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudSun } from 'lucide-react';
import { api } from '../../api/client';
import type {
  WeatherLocationSuggestion,
  WeatherOverlayMode,
} from '../../api/types';

const WEATHER_MODE_OPTIONS: { value: WeatherOverlayMode; label: string }[] = [
  { value: 'always', label: 'Immer anzeigen' },
  { value: 'sometimes', label: 'Bei manchen Bildern einblenden' },
];

function optionFor(location: WeatherLocationSuggestion) {
  return { value: String(location.id), label: location.label };
}

export function WeatherPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['weather-settings'],
    queryFn: api.weather.settings,
  });
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<WeatherOverlayMode>('always');
  const [forecastDays, setForecastDays] = useState(4);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [selectedLocation, setSelectedLocation] =
    useState<WeatherLocationSuggestion | null>(null);
  const [selectedLocationValue, setSelectedLocationValue] = useState<
    string | null
  >(null);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['weather-locations', debouncedSearch],
    queryFn: () => api.weather.locations(debouncedSearch),
    enabled: debouncedSearch.trim().length >= 2,
  });

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setMode(settings.mode);
    setForecastDays(settings.forecastDays);
    setSelectedLocation(settings.location);
    setSelectedLocationValue(
      settings.location ? String(settings.location.id) : null,
    );
    setSearch(settings.location?.label ?? '');
  }, [settings]);

  const locationOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    if (selectedLocation) {
      const option = optionFor(selectedLocation);
      map.set(option.value, option);
    }
    for (const suggestion of suggestions) {
      const option = optionFor(suggestion);
      map.set(option.value, option);
    }
    return [...map.values()];
  }, [selectedLocation, suggestions]);

  const updateMutation = useMutation({
    mutationFn: api.weather.updateSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(['weather-settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      notifications.show({
        message: 'Wetter-Einstellungen gespeichert',
        color: 'teal',
      });
    },
  });

  const selectedLocationIsValid =
    selectedLocation !== null && search === selectedLocation.label;
  const saveDisabled = enabled && !selectedLocationIsValid;

  return (
    <Stack>
      <Title order={3}>Wetter</Title>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Switch
            label="Wetter anzeigen"
            description="Zeigt aktuelles Wetter und Vorhersage in der Diashow."
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />

          <Select
            label="Ort"
            description="Bitte einen vorgeschlagenen Ort auswählen. Freie Eingaben werden nicht gespeichert."
            placeholder="Ort suchen..."
            leftSection={<CloudSun size={16} />}
            data={locationOptions}
            value={selectedLocationValue}
            searchValue={search}
            onSearchChange={(value) => {
              setSearch(value);
              if (selectedLocation && value !== selectedLocation.label) {
                setSelectedLocation(null);
                setSelectedLocationValue(null);
              }
            }}
            onChange={(value) => {
              setSelectedLocationValue(value);
              const suggestion = suggestions.find(
                (item) => String(item.id) === value,
              );
              const nextLocation =
                suggestion ??
                (settings?.location && String(settings.location.id) === value
                  ? settings.location
                  : null);
              setSelectedLocation(nextLocation);
              if (nextLocation) setSearch(nextLocation.label);
            }}
            searchable
            clearable
            nothingFoundMessage={isFetching ? 'Suche...' : 'Kein Ort gefunden'}
          />

          <Select
            label="Anzeigeverhalten"
            description="Bei manchen Bildern wird das Wetter gemeinsam mit dem Datum eingeblendet."
            data={WEATHER_MODE_OPTIONS}
            value={mode}
            onChange={(value) => value && setMode(value as WeatherOverlayMode)}
            disabled={!enabled}
            allowDeselect={false}
          />

          <NumberInput
            label="Vorhersage-Tage"
            min={3}
            max={7}
            value={forecastDays}
            onChange={(value) => setForecastDays(Number(value) || 4)}
            disabled={!enabled}
          />

          <Text size="xs" c="dimmed">
            Wetterdaten kommen von Open-Meteo. Der Ort wird über
            Open-Meteo-Geocoding validiert.
          </Text>
        </Stack>
      </Card>

      <Button
        onClick={() =>
          updateMutation.mutate({
            enabled,
            mode,
            forecastDays,
            locationId: selectedLocation?.id,
          })
        }
        disabled={saveDisabled}
        loading={updateMutation.isPending}
        w={{ base: '100%', sm: 200 }}
      >
        Speichern
      </Button>
    </Stack>
  );
}
